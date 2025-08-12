/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import { FailedProductUploadModel } from '../error_handaler/failedProductUpload.model.js';
import { default as productModel } from '../product/product.model.js';
import storeModel from '../store/store.model.js';
import { StoreAccessRequest } from '../types/store-access';
import { ProductHistoryRow } from '../types/types.js';
import { checkStoreAccess } from '../utils/store-access.js';
import productHistoryModel from './productHistory.model.js';

export const createProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      storeID,
      purchase = 0,
      lost = 0,
      sentToWfs = 0,
      sku,
      upc,
      costOfPrice = 0,
      orderId = '',
      sellPrice = 0,
      date = new Date(),
      status = '',
      email = '',
      card = '',
      supplierName = '',
      supplierLink = '',
    } = req.body;

    // Create history record
    const newProduct = await productHistoryModel.create(
      [
        {
          storeID,
          purchaseQuantity: purchase,
          lostQuantity: lost,
          sendToWFS: sentToWfs,
          costOfPrice,
          status,
          upc: upc,
          sku: sku,
          orderId,
          sellPrice,
          date,
          email,
          card,
          supplier: {
            name: supplierName,
            link: supplierLink,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json({
      newProduct: newProduct[0],
      success: true,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const getSingleProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    res.status(200).json({ product, success: true });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    const updatedProduct = await productHistoryModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.status(200).json({ updatedProduct, success: true });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    await product.deleteOne();
    res
      .status(200)
      .json({ message: 'Product deleted successfully', success: true });
  } catch (error) {
    next(error);
  }
};

// ✅ Get All Product History - Optimized Version
export const getAllProductHistory = async (
  req: StoreAccessRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;
    const search = String(req.query.sku || req.query.search || '').trim();
    const storeIDParam = req.query.storeID as string | undefined;

    // Process store IDs
    let storeIDs: mongoose.Types.ObjectId[] | undefined;
    if (storeIDParam) {
      storeIDs = storeIDParam
        .split(',')
        .map((id) => new mongoose.Types.ObjectId(id.trim()));

      // Verify access to all requested stores
      for (const id of storeIDs) {
        if (!checkStoreAccess(user, id.toString())) {
          return next(
            createHttpError(403, `No access to store ${id.toString()}`)
          );
        }
      }
    } else {
      storeIDs = user.allowedStores.filter(
        (id) => id instanceof mongoose.Types.ObjectId
      );
    }

    // Base pipeline with store filtering
    const pipeline: any[] = [
      {
        $match: {
          storeID: { $in: storeIDs },
        },
      },
      {
        $lookup: {
          from: 'stores',
          localField: 'storeID',
          foreignField: '_id',
          as: 'store',
        },
      },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    ];

    // Add search filter if search term exists
    if (search) {
      pipeline.unshift({
        $match: {
          $or: [
            { sku: { $regex: search, $options: 'i' } },
            { upc: { $regex: search, $options: 'i' } },
            { orderId: { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    // Pagination setup
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Get both data and count in parallel
    const [products, countResult, summaryResult] = await Promise.all([
      productHistoryModel.aggregate([
        ...pipeline,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
      productHistoryModel.aggregate([...pipeline, { $count: 'total' }]),
      productHistoryModel.aggregate([
        ...pipeline,
        {
          $group: {
            _id: null,
            totalPurchase: { $sum: '$purchaseQuantity' },
            totalOrder: { $sum: '$orderQuantity' },
            totalLost: { $sum: '$lostQuantity' },
            totalSendToWFS: { $sum: '$sendToWFS' },
            totalCost: {
              $sum: { $multiply: ['$purchaseQuantity', '$costOfPrice'] },
            },
            totalWFSCost: {
              $sum: { $multiply: ['$sendToWFS', '$costOfPrice'] },
            },
            totalLostCost: {
              $sum: { $multiply: ['$lostQuantity', '$costOfPrice'] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalPurchase: 1,
            totalOrder: 1,
            totalLost: 1,
            totalSendToWFS: 1,
            totalCost: 1,
            totalWFSCost: 1,
            remainingQuantity: {
              $subtract: ['$totalPurchase', '$totalSendToWFS'],
            },
            remainingCost: {
              $round: [{ $subtract: ['$totalCost', '$totalWFSCost'] }, 2],
            },
            remainingOrderQuantity: {
              $subtract: ['$totalPurchase', '$totalOrder'],
            },
            totalLostCost: 1,
          },
        },
      ]),
    ]);

    const total = countResult[0]?.total || 0;
    const summary = summaryResult[0] || {
      totalPurchase: 0,
      totalOrder: 0,
      totalLost: 0,
      totalLostCost: 0,
      totalSendToWFS: 0,
      totalCost: 0,
      totalWFSCost: 0,
      remainingQuantity: 0,
      remainingCost: 0,
      remainingOrderQuantity: 0,
    };

    res.status(200).json({
      success: true,
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSingleField = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { field, value } = req.body;

    const inventoryFields = ['purchaseQuantity', 'lostQuantity', 'sendToWFS'];
    const validFields = [
      'orderId',
      ...inventoryFields,
      'costOfPrice',
      'sellPrice',
      'date',
      'status',
      'card',
      'email',
      'supplier',
      'upc',
    ];

    if (!validFields.includes(field)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid field name' });
    }

    // First get the current history record
    const currentHistory = await productHistoryModel
      .findById(id)
      .session(session);
    if (!currentHistory) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Product history not found' });
    }

    // Prepare update object
    const updateObj: any = { updatedAt: new Date() };

    if (field === 'supplier') {
      let supplierData;
      try {
        supplierData = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Invalid supplier format' });
      }

      if (!supplierData.name || !supplierData.link) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ message: 'Missing supplier name or link' });
      }

      updateObj.supplier = {
        name: supplierData.name,
        link: supplierData.link,
      };
    } else {
      updateObj[field] = value;
    }

    // Update the history record
    const updatedHistory = await productHistoryModel.findByIdAndUpdate(
      id,
      updateObj,
      { new: true, session }
    );

    if (!updatedHistory) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Product history not found' });
    }

    // If this is an inventory-related field, update the product
    if (inventoryFields.includes(field)) {
      // Get the previous and new values
      const oldValue = (currentHistory as any)[field] || 0;
      const newValue = (updatedHistory as any)[field] || 0;
      const difference = newValue - oldValue;

      // Calculate how this affects inventory
      let updateProduct = {};
      switch (field) {
        case 'receiveQuantity':
          updateProduct = {
            $inc: {
              available: difference,
            },
          };
          break;
        case 'lostQuantity':
          updateProduct = {
            $inc: {
              available: -difference,
            },
          };
          break;
        case 'sendToWFS':
          updateProduct = {
            $inc: {
              available: -difference,
            },
          };
          break;
        case 'purchaseQuantity':
          updateProduct = {
            $inc: {
              available: difference,
            },
          };
          break;
      }
    }

    await session.commitTransaction();
    res.status(200).json({
      message: `${field} updated successfully`,
      updatedHistory,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const getProductHistoryList = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const id = req.params.id;
  try {
    const product = await productModel.findById(id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    const productHistoryList = await productHistoryModel.find({
      productId: id,
    });
    const data = {
      ...product.toObject(),
      history: productHistoryList,
    };

    res.status(200).json({ data, success: true });
  } catch (error) {
    next(error);
  }
};

export const bulkUploadProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Constants
  const BATCH_SIZE = 50;
  const MAX_TRANSACTION_TIME_MS = 600000; // 10 minutes

  try {
    // 1. Parse the Excel file
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      dense: true,
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = xlsx.utils.sheet_to_json<ProductHistoryRow>(worksheet, {
      header: [
        'date', // A
        'orderId', // B
        'upc', // C
        'purchase', // D (Purchased)
        '', // E (Received) - skip
        'lost', // F (Lost/Damaged)
        'sentToWfs', // G (Sent to wfs)
        '', // H (Remaining) - skip
        'costPerItem', // I (Cost per item)
        '', // J (Total cost) - skip
        '', // K (Sent to wfs cost) - skip
        '', // L (Remaining) - skip
        'status', // M (Status)
      ],
      range: 2,
      defval: null,
      raw: false,
    });

    // 2. Pre-process data
    const { validRows, skippedRows, uniqueUpcs } = processRawData(rawData);

    if (validRows.length === 0) {
      return res.status(400).json({
        message: 'No valid rows found',
        details: skippedRows,
      });
    }

    // 3. Get store info and products
    const store = await storeModel
      .findById(req.body.storeID)
      .select('storeId')
      .lean();

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const products = await productModel.find({
      storeId: store.storeId,
      $or: [
        { sku: { $in: Array.from(uniqueUpcs) } },
        { upc: { $in: Array.from(uniqueUpcs) } },
      ],
    });

    const productMap = createProductMaps(products);

    // 4. Process in batches within a transaction
    const session = await mongoose.startSession();
    session.startTransaction({
      maxCommitTimeMS: MAX_TRANSACTION_TIME_MS,
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority', j: true },
    });

    try {
      // Clear previous failed records
      await FailedProductUploadModel.deleteMany({
        storeObjectId: req.body.storeID,
      }).session(session);

      const results = {
        totalRows: rawData.length,
        validRows: validRows.length,
        batchesProcessed: 0,
        inserted: 0,
        updated: 0,
        skipped: skippedRows.length,
        failed: 0,
        errors: [] as any[],
      };

      // Process in batches
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const batchResults = await processBatch(
          batch,
          req.body.storeID,
          store.storeId,
          productMap,
          session
        );

        results.inserted += batchResults.inserted;
        results.updated += batchResults.updated;
        results.failed += batchResults.failed;
        results.errors.push(...batchResults.errors);
        results.batchesProcessed++;
      }

      // Save skipped rows as failed uploads
      if (skippedRows.length > 0) {
        const failedUploads = skippedRows.map(({ row, reason }) => ({
          storeId: store.storeId,
          storeObjectId: req.body.storeID,
          uploadDate: new Date(),
          fileName: req.file!.originalname,
          rowData: row,
          upc: String(row.upc || '').trim(),
          orderId: String(row.orderId || '').trim(),
          reason: 'SKIPPED',
          errorDetails: reason,
          processed: false,
        }));

        await FailedProductUploadModel.insertMany(failedUploads, { session });
      }

      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        data: results,
        sampleErrors: results.errors.slice(0, 5),
      });
    } catch (error: any) {
      await session.abortTransaction();
      console.error('Transaction error:', error);
      return res.status(500).json({
        success: false,
        message: 'Transaction failed',
        error: error.message,
      });
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    console.error('Processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'File processing failed',
      error: error.message,
    });
  }
};

// Helper functions

function processRawData(rawData: ProductHistoryRow[]) {
  const uniqueUpcs = new Set<string>();
  const orderIdSet = new Set<string>();
  const validRows: ProductHistoryRow[] = [];
  const skippedRows: Array<{ row: ProductHistoryRow; reason: string }> = [];

  for (const row of rawData) {
    if (!row.upc && !row.orderId) {
      skippedRows.push({ row, reason: 'Missing both UPC and Order ID' });
      continue;
    }

    const upc = String(row.upc || '').trim();
    if (!upc || upc === 'UPC') {
      skippedRows.push({ row, reason: 'Invalid or empty UPC' });
      continue;
    }

    const orderId = String(row.orderId || '').trim();
    if (orderId && orderIdSet.has(orderId)) {
      skippedRows.push({ row, reason: 'Duplicate Order ID' });
      continue;
    }

    orderIdSet.add(orderId);
    uniqueUpcs.add(upc);
    validRows.push(row);
  }

  return { validRows, skippedRows, uniqueUpcs };
}

function createProductMaps(products: any[]) {
  const productMap = new Map<string, any>();
  products.forEach((p) => {
    if (p.sku) productMap.set(p.sku, p);
    if (p.upc) productMap.set(p.upc, p);
  });
  return productMap;
}

async function processBatch(
  batch: ProductHistoryRow[],
  storeObjectId: string,
  storeId: string,
  productMap: Map<string, any>,
  session: mongoose.ClientSession
) {
  try {
    const bulkUpdates = [];
    const bulkInserts = [];
    const errors = [];
    const failedUploads = [];

    for (const row of batch) {
      try {
        const upc = String(row.upc || '').trim();
        const product = productMap.get(upc);
        const orderId = String(row.orderId || '').trim();

        // Parse numeric values
        const parseNumber = (value: any): number => {
          if (value === null || value === undefined || value === '') return 0;
          if (typeof value === 'string') {
            if (value.startsWith('=')) return 0;
            value = value.replace(/[^0-9.-]+/g, '');
          }
          return Number(value) || 0;
        };

        const purchaseQuantity = parseNumber(row.purchase);
        const lostQuantity = parseNumber(row.lost);
        const sendToWFS = parseNumber(row.sentToWfs);
        const costPerItem = parseNumber(row.costPerItem);

        // Check for existing record
        const existingItem = await productHistoryModel
          .findOne({
            storeID: storeObjectId,
            orderId,
          })
          .session(session);

        if (existingItem) {
          continue;
        }

        // Check for zero quantity item to update
        const zeroQuantityItem = await productHistoryModel
          .findOne({
            $or: [{ sku: upc }, { upc }],
            storeID: storeObjectId,
            purchaseQuantity: 0,
            orderId: '',
          })
          .session(session);

        const historyRecord = {
          storeID: storeObjectId,
          orderId,
          sku: upc,
          upc,
          purchaseQuantity,
          orderQuantity: 0, // Added order quantity
          lostQuantity,
          sendToWFS,
          costOfPrice: costPerItem,
          sellPrice: product?.price?.amount || 0,
          date: row.date ? new Date(row.date) : new Date(),
          status: String(row.status || ''),
          supplier: { name: '', link: String(row.link || '') },
          email: '',
          card: '',
        };

        if (zeroQuantityItem) {
          bulkUpdates.push({
            updateOne: {
              filter: { _id: zeroQuantityItem._id },
              update: { $set: historyRecord },
            },
          });
        } else {
          bulkInserts.push(historyRecord);
        }
      } catch (error: any) {
        errors.push({
          row,
          error: error.message,
        });

        failedUploads.push({
          storeId,
          storeObjectId,
          uploadDate: new Date(),
          fileName: '',
          rowData: row,
          upc: String(row.upc || '').trim(),
          orderId: String(row.orderId || '').trim(),
          reason: 'ERROR',
          errorDetails: error.message,
          processed: false,
        });
      }
    }

    // Execute batch operations
    let inserted = 0;
    let updated = 0;

    // console.log('bulkUpdates', bulkUpdates.length);
    // console.log('bulkInserts', bulkInserts.length);

    if (bulkUpdates.length > 0) {
      const updateResult = await productHistoryModel.bulkWrite(bulkUpdates, {
        session,
        ordered: false,
      });
      updated += updateResult.modifiedCount || 0;
    }

    if (bulkInserts.length > 0) {
      await productHistoryModel.insertMany(bulkInserts, { session });
      inserted += bulkInserts.length;
    }

    if (failedUploads.length > 0) {
      await FailedProductUploadModel.insertMany(failedUploads, { session });
    }

    return {
      inserted,
      updated,
      failed: failedUploads.length,
      errors,
    };
  } catch (error: any) {
    console.error('Batch processing error:', {
      batchSize: batch.length,
      firstRow: batch[0],
      error: error.message,
      stack: error.stack,
    });
    throw error; // Re-throw to trigger transaction abort
  }
}
