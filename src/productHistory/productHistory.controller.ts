/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import mongoose, { AnyBulkWriteOperation, ClientSession } from 'mongoose';
import xlsx from 'xlsx';
import productModel from '../product/product.model.js';
import storeModel from '../store/store.model.js';
import { StoreAccessRequest } from '../types/store-access';
import { ProductHistoryRow } from '../types/types.js';
import { checkStoreAccess } from '../utils/store-access.js';
import productHistoryModel, { UploadError } from './productHistory.model.js';
import { TransactionOptions } from 'mongodb';

export const createProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const {
      storeID,
      purchase = 0,
      received = 0,
      lost = 0,
      sentToWfs = 0,
      costOfPrice = 0,
      orderId = '',
      sellPrice = 0,
      date = new Date(),
      status = '',
      email = '',
      card = '',
      supplier,
    } = req.body;

    // Check if product exists
    const product = await productModel.findById(id).session(session);
    if (!product) {
      await session.abortTransaction();
      return next(createHttpError(404, 'Product not found'));
    }

    // Handle supplier
    let supplierObject;
    if (supplier) {
      try {
        supplierObject =
          typeof supplier === 'string' ? JSON.parse(supplier) : supplier;
        if (!supplierObject?.name || !supplierObject?.link) {
          await session.abortTransaction();
          return res
            .status(400)
            .json({ message: 'Supplier must have name and link' });
        }
      } catch {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Invalid supplier format' });
      }
    }

    // Create history record
    const newProduct = await productHistoryModel.create(
      [
        {
          productId: product._id,
          storeID,
          purchaseQuantity: purchase,
          receiveQuantity: received,
          lostQuantity: lost,
          sendToWFS: sentToWfs,
          costOfPrice,
          status,
          orderId,
          sellPrice,
          date,
          email,
          card,
          supplier: supplierObject,
        },
      ],
      { session }
    );

    // Update product inventory
    await productModel.updateOne(
      { _id: product._id },
      {
        $inc: {
          available: received - lost,
        },
        $set: {
          lastInventoryUpdate: new Date(),
        },
      },
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

// ✅ Get All Product History
export const getAllProductHistory = async (
  req: StoreAccessRequest, // Changed to StoreAccessRequest
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!; // Get the authenticated user
    const search = String(
      req.query.sku || req.query.productName || req.query.search || ''
    ).trim();

    const storeID = req.query.storeID as string | undefined;

    const pipeline: any[] = [
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
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

    // Store filtering logic - similar to getOrders
    if (storeID) {
      // If specific store is requested, verify access
      if (!checkStoreAccess(user, storeID)) {
        return next(createHttpError(403, 'No access to this store'));
      }
      pipeline.push({
        $match: { storeID: new mongoose.Types.ObjectId(storeID) },
      });
    } else {
      // If no store specified, filter by user's allowed stores
      const allowedStores = await storeModel
        .find({
          _id: { $in: user.allowedStores },
        })
        .select('_id'); // We need the _id for matching

      pipeline.push({
        $match: {
          storeID: {
            $in: allowedStores.map((store) => store._id),
          },
        },
      });
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'product.sku': { $regex: search, $options: 'i' } },
            { 'product.productName': { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    // Clone for count & aggregation
    const countPipeline = [...pipeline, { $count: 'total' }];
    const totalAggregationPipeline = [
      ...pipeline,
      {
        $group: {
          _id: null,
          totalPurchase: { $sum: '$purchaseQuantity' },
          totalReceive: { $sum: '$receiveQuantity' },
          totalLost: { $sum: '$lostQuantity' },
          totalSendToWFS: { $sum: '$sendToWFS' },
          totalCost: {
            $sum: { $multiply: ['$purchaseQuantity', '$costOfPrice'] },
          },
          totalWFSCost: { $sum: { $multiply: ['$sendToWFS', '$costOfPrice'] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalPurchase: 1,
          totalReceive: 1,
          totalLost: 1,
          totalSendToWFS: 1,
          totalCost: 1,
          totalWFSCost: 1,
          remainingQuantity: {
            $subtract: ['$totalReceive', '$totalSendToWFS'],
          },
          remainingCost: { $subtract: ['$totalCost', '$totalWFSCost'] },
        },
      },
    ];

    const [countResult, summaryResult] = await Promise.all([
      productHistoryModel.aggregate(countPipeline),
      productHistoryModel.aggregate(totalAggregationPipeline),
    ]);

    const total = countResult[0]?.total || 0;
    const summary = summaryResult[0] || {
      totalPurchase: 0,
      totalReceive: 0,
      totalLost: 0,
      totalSendToWFS: 0,
      totalCost: 0,
      totalWFSCost: 0,
      remainingQuantity: 0,
      remainingCost: 0,
    };

    // Pagination
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const products = await productHistoryModel.aggregate(pipeline);

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

    const inventoryFields = [
      'purchaseQuantity',
      'receiveQuantity',
      'lostQuantity',
      'sendToWFS',
    ];
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

      if (Object.keys(updateProduct).length > 0) {
        await productModel.findByIdAndUpdate(
          currentHistory.productId,
          {
            ...updateProduct,
            $set: { lastInventoryUpdate: new Date() },
          },
          { session }
        );
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

// Bulk upload
export const bulkUploadProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction({
    maxCommitTimeMS: 120000, // 60 seconds timeout
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', wtimeout: 5000 },
  });

  try {
    if (!req.file) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      sheetStubs: true,
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json<ProductHistoryRow>(worksheet, {
      header: [
        'date',
        'picture',
        'orderId',
        'link',
        'purchase',
        'received',
        'lostDamaged',
        'sentToWfs',
        'remaining',
        'costPerItem',
        'totalCost',
        'sentToWfsCost',
        'remainingCost',
        'status',
        'upc',
        'wfsStatus',
      ],
      range: 2,
      defval: null,
      raw: false,
    });

    // Pre-process data to group by product
    const productGroups = new Map<string, any[]>();
    const processedOrderIds = new Set<string>();

    for (const row of data) {
      if (!row.upc && !row.orderId) continue;

      const upc = String(row.upc || '').trim();
      if (!upc || upc === 'UPC') continue;

      const orderId = String(row.orderId || '').trim();

      // Skip duplicates in same upload
      if (orderId && processedOrderIds.has(orderId)) {
        continue;
      }
      processedOrderIds.add(orderId);

      if (!productGroups.has(upc)) {
        productGroups.set(upc, []);
      }
      (productGroups.get(upc) ?? []).push(row);
    }

    // Process products in batches
    const bulkUpdates = [];
    const bulkInserts = [];
    const productUpdates = new Map<string, number>();
    const skippedProducts = [];
    const upcBatchSize = 20;

    const upcBatches = Array.from(productGroups.keys()).reduce(
      (batches: string[][], upc, i) => {
        if (i % upcBatchSize === 0) batches.push([]);
        batches[batches.length - 1].push(upc);
        return batches;
      },
      []
    );

    for (const upcBatch of upcBatches) {
      // Find all products in this batch
      const products = await productModel
        .find({
          $or: [{ sku: { $in: upcBatch } }, { upc: { $in: upcBatch } }],
        })
        .session(session);

      const productMap = new Map(
        products.flatMap((p): [string, any][] =>
          [p.sku && [p.sku, p], p.upc && [p.upc, p]].filter(
            (value): value is [string, any] =>
              value !== null && value !== undefined
          )
        )
      );

      for (const upc of upcBatch) {
        const product = productMap.get(upc);
        if (!product) {
          skippedProducts.push(upc);
          continue;
        }

        const productId = product._id.toString();
        const rows = productGroups.get(upc);

        if (!rows) {
          continue;
        }

        let netAvailableChange = 0;
        const processedQuantities = new Set<string>();

        for (const row of rows) {
          const parseNumber = (value: any): number => {
            if (value === null || value === undefined || value === '') return 0;
            if (typeof value === 'string') {
              if (value.startsWith('=')) return 0;
              value = value.replace(/[^0-9.-]+/g, '');
            }
            return Number(value) || 0;
          };

          const purchaseQuantity = parseNumber(row.purchase);
          const receiveQuantity = parseNumber(row.received);
          const lostQuantity = parseNumber(row.lostDamaged);
          const sendToWFS = parseNumber(row.sentToWfs);
          const orderId = String(row.orderId || '').trim();

          // Calculate net change only for new records
          const quantityKey = `${purchaseQuantity}-${receiveQuantity}-${lostQuantity}-${sendToWFS}`;
          if (!processedQuantities.has(quantityKey)) {
            netAvailableChange += receiveQuantity - lostQuantity - sendToWFS;
            processedQuantities.add(quantityKey);
          }

          // Check for existing record
          const existingItem = await productHistoryModel
            .findOne({
              productId: product._id,
              storeID: req.body.storeID,
              orderId,
            })
            .session(session);

          if (existingItem) continue;

          // Check for zero quantity item to update
          const zeroQuantityItem = await productHistoryModel
            .findOne({
              productId: product._id,
              storeID: req.body.storeID,
              purchaseQuantity: 0,
              receiveQuantity: 0,
              lostQuantity: 0,
              sendToWFS: 0,
              orderId: '',
            })
            .session(session);

          // console.log('zeroQuantityItem', zeroQuantityItem);

          if (zeroQuantityItem) {
            bulkUpdates.push({
              updateOne: {
                filter: { _id: zeroQuantityItem._id },
                update: {
                  $set: {
                    orderId,
                    purchaseQuantity,
                    receiveQuantity,
                    lostQuantity,
                    sendToWFS,
                    costOfPrice: parseNumber(row.costPerItem),
                    sellPrice: zeroQuantityItem.sellPrice,
                    totalPrice: String(row.totalCost || '0'),
                    date: row.date ? new Date(row.date) : new Date(),
                    status: String(row.status || ''),
                    upc,
                    supplier: { name: '', link: String(row.link || '') },
                    email: '',
                    card: '',
                  },
                },
              },
            });
          } else {
            // Get recent sellPrice
            const recentHistory = await productHistoryModel
              .findOne({
                storeID: req.body.storeID,
                $or: [
                  { upc: product.upc }, // Match UPC if exists
                  { upc: product.sku }, // Match SKU if UPC doesn't match
                ],
              })
              .sort({ date: -1 })
              .session(session);

            // console.log('recentHistory', recentHistory);

            bulkInserts.push({
              productId: product._id,
              storeID: req.body.storeID,
              orderId,
              purchaseQuantity,
              receiveQuantity,
              lostQuantity,
              sendToWFS,
              costOfPrice: parseNumber(row.costPerItem),
              sellPrice: recentHistory?.sellPrice || 0,
              totalPrice: String(row.totalCost || '0'),
              date: row.date ? new Date(row.date) : new Date(),
              status: String(row.status || ''),
              upc,
              supplier: { name: '', link: String(row.link || '') },
              email: '',
              card: '',
            });
          }
        }

        if (netAvailableChange !== 0) {
          productUpdates.set(
            productId,
            (productUpdates.get(productId) || 0) + netAvailableChange
          );
        }
      }
    }

    // Execute all operations in parallel
    const [updateResults, insertResults, productUpdateResults] =
      await Promise.all([
        bulkUpdates.length > 0
          ? productHistoryModel.bulkWrite(bulkUpdates, { session })
          : null,
        bulkInserts.length > 0
          ? productHistoryModel.insertMany(bulkInserts, { session })
          : null,
        productUpdates.size > 0
          ? productModel.bulkWrite(
              Array.from(productUpdates.entries()).map(
                ([productId, change]) => ({
                  updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(productId) },
                    update: {
                      $inc: { available: change },
                      $set: { lastInventoryUpdate: new Date() },
                    },
                  },
                })
              ),
              { session }
            )
          : null,
      ]);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      stats: {
        totalRows: data.length,
        processed: bulkUpdates.length + bulkInserts.length,
        updated: bulkUpdates.length,
        inserted: bulkInserts.length,
        skippedProducts: skippedProducts.length,
        productsUpdated: productUpdates.size,
      },
      details: {
        skippedProducts,
      },
    });
  } catch (err: any) {
    await session.abortTransaction();
    console.error('Bulk upload failed:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
      body: req.body, // Log the request body
      fileSize: req.file?.size,
      headers: req.headers,
    });
    next(err);
  } finally {
    session.endSession();
  }
};

// old working
// export const bulkUploadProductHistory = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     if (!req.file) {
//       await session.abortTransaction();
//       return res.status(400).json({ message: 'No file uploaded' });
//     }

//     const workbook = xlsx.read(req.file.buffer, {
//       type: 'buffer',
//       cellDates: true,
//       sheetStubs: true,
//     });

//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];

//     const data = xlsx.utils.sheet_to_json<ProductHistoryRow>(worksheet, {
//       header: [
//         'date',
//         'picture',
//         'orderId',
//         'link',
//         'purchase',
//         'received',
//         'lostDamaged',
//         'sentToWfs',
//         'remaining',
//         'costPerItem',
//         'totalCost',
//         'sentToWfsCost',
//         'remainingCost',
//         'status',
//         'upc',
//         'wfsStatus',
//       ],
//       range: 2,
//       defval: null,
//       raw: false,
//     });

//     const bulkUpdates = [];
//     const bulkInserts = [];
//     const availableUpdates = new Map<string, number>();
//     const skippedProducts = [];
//     const errors = [];
//     const processedOrderIds = new Set<string>();
//     const processedProductQuantities = new Map<string, Set<string>>();

//     for (const [index, row] of data.entries()) {
//       try {
//         if (!row.upc && !row.orderId) continue;

//         const upc = String(row.upc || '').trim();
//         if (!upc || upc === 'UPC') continue;

//         const orderId = String(row.orderId || '').trim();

//         // Skip if we've already processed this orderId in current upload
//         if (orderId && processedOrderIds.has(orderId)) {
//           continue;
//         }
//         processedOrderIds.add(orderId);

//         const product = await productModel
//           .findOne({
//             $or: [{ sku: upc }, { upc: upc }],
//           })
//           .session(session);

//         if (!product) {
//           skippedProducts.push({ upc, row });
//           continue;
//         }

//         const parseNumber = (value: any): number => {
//           if (value === null || value === undefined || value === '') return 0;
//           if (typeof value === 'string') {
//             if (value.startsWith('=')) return 0;
//             value = value.replace(/[^0-9.-]+/g, '');
//           }
//           const num = Number(value);
//           return isNaN(num) ? 0 : num;
//         };

//         const purchaseQuantity = parseNumber(row.purchase);
//         const receiveQuantity = parseNumber(row.received);
//         const lostQuantity = parseNumber(row.lostDamaged);
//         const sendToWFS = parseNumber(row.sentToWfs);
//         const productId = product._id.toString();

//         // Check for existing record in database with same productId, storeID and orderId
//         const existingItem = await productHistoryModel
//           .findOne({
//             productId: product._id,
//             storeID: req.body.storeID,
//             orderId,
//           })
//           .session(session);

//         if (existingItem) {
//           // Skip if this exact record already exists in database
//           continue;
//         }

//         // Only process quantities if this is a completely new record
//         const quantityKey = `${purchaseQuantity}-${lostQuantity}`;
//         if (!processedProductQuantities.has(productId)) {
//           processedProductQuantities.set(productId, new Set());
//         }

//         if (!processedProductQuantities.get(productId)?.has(quantityKey)) {
//           const netAvailableChange = purchaseQuantity - lostQuantity;
//           availableUpdates.set(
//             productId,
//             (availableUpdates.get(productId) || 0) + netAvailableChange
//           );
//           processedProductQuantities.get(productId)?.add(quantityKey);
//         }

//         // Check for zero quantity item to update
//         const zeroQuantityItem = await productHistoryModel
//           .findOne({
//             productId: product._id,
//             storeID: req.body.storeID,
//             purchaseQuantity: 0,
//             receiveQuantity: 0,
//             lostQuantity: 0,
//             sendToWFS: 0,
//             orderId: '', // Only match items with empty orderId
//           })
//           .session(session);

//           // console.log('zeroQuantityItem', zeroQuantityItem);

//         if (zeroQuantityItem) {
//           bulkUpdates.push({
//             updateOne: {
//               filter: { _id: zeroQuantityItem._id },
//               update: {
//                 $set: {
//                   orderId,
//                   purchaseQuantity,
//                   receiveQuantity,
//                   lostQuantity,
//                   sendToWFS,
//                   costOfPrice: parseNumber(row.costPerItem),
//                   sellPrice: zeroQuantityItem.sellPrice, // Keep existing sellPrice
//                   totalPrice: String(row.totalCost || '0'),
//                   date: row.date ? new Date(row.date) : new Date(),
//                   status: String(row.status || ''),
//                   upc,
//                   supplier: { name: '', link: String(row.link || '') },
//                   email: '',
//                   card: '',
//                 },
//               },
//             },
//           });
//         } else {
//           // Find most recent sellPrice for this product
//           const recentHistory = await productHistoryModel
//             .findOne({
//               productId: product._id,
//               storeID: req.body.storeID,
//             })
//             .sort({ date: -1 })
//             .session(session);

//             console.log('recentHistory', recentHistory);

//           // Insert new record
//           bulkInserts.push({
//             productId: product._id,
//             storeID: req.body.storeID,
//             orderId,
//             purchaseQuantity,
//             receiveQuantity,
//             lostQuantity,
//             sendToWFS,
//             costOfPrice: parseNumber(row.costPerItem),
//             sellPrice: recentHistory?.sellPrice || 0,
//             totalPrice: String(row.totalCost || '0'),
//             date: row.date ? new Date(row.date) : new Date(),
//             status: String(row.status || ''),
//             upc,
//             supplier: { name: '', link: String(row.link || '') },
//             email: '',
//             card: '',
//           });
//         }
//       } catch (error: any) {
//         errors.push({
//           rowIndex: index,
//           row,
//           error: error.message,
//         });
//       }
//     }

//     // Execute all operations in transaction
//     // const [updateResults, insertResults] = await Promise.all([
//     //   bulkUpdates.length > 0
//     //     ? productHistoryModel.bulkWrite(bulkUpdates, { session })
//     //     : null,
//     //   bulkInserts.length > 0
//     //     ? productHistoryModel.insertMany(bulkInserts, {
//     //         session,
//     //         ordered: false,
//     //       })
//     //     : null,
//     // ]);

//     // // Update available quantities in single bulk operation
//     // if (availableUpdates.size > 0) {
//     //   await productModel.bulkWrite(
//     //     Array.from(availableUpdates.entries()).map(([productId, change]) => ({
//     //       updateOne: {
//     //         filter: { _id: new mongoose.Types.ObjectId(productId) },
//     //         update: {
//     //           $inc: { available: change },
//     //           $set: { lastInventoryUpdate: new Date() },
//     //         },
//     //       },
//     //     })),
//     //     { session }
//     //   );
//     // }

//     await session.commitTransaction();

//     res.status(200).json({
//       success: true,
//       message: `Processed ${bulkUpdates.length + bulkInserts.length} records`,
//       details: {
//         updated: bulkUpdates.length,
//         inserted: bulkInserts.length,
//         skippedProducts: skippedProducts.length,
//         errors: errors.length,
//         productsUpdated: availableUpdates.size,
//       },
//       updateResults: updateResults
//         ? {
//             matchedCount: updateResults.matchedCount,
//             modifiedCount: updateResults.modifiedCount,
//           }
//         : null,
//       insertResults: insertResults ? { count: insertResults.length } : null,
//       sampleErrors: errors.slice(0, 5),
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     console.error('Bulk upload failed:', err);
//     next(err);
//   } finally {
//     session.endSession();
//   }
// };
