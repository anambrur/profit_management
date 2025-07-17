/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import productModel from '../product/product.model.js';
import { ProductHistoryRow } from '../types/types.js';
import productHistoryModel from './productHistory.model.js';
import { checkStoreAccess, StoreAccessRequest } from '../utils/store-access.js';
import storeModel from '../store/store.model.js';

// Create product history
// export const createProductHistory = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { id } = req.params;
//     const {
//       storeID,
//       purchase,
//       received,
//       lost,
//       sentToWfs,
//       costOfPrice,
//       orderId,
//       sellPrice,
//       date,
//       status,
//       email,
//       card,
//       supplier,
//     } = req.body;

//     // Check if product exists
//     const product = await productModel.findById(id);
//     if (!product) {
//       return next(createHttpError(404, 'Product not found'));
//     }

//     // Handle supplier (could be stringified JSON or object)
//     let supplierObject: { name: string; link: string } | undefined;

//     if (supplier) {
//       if (typeof supplier === 'string') {
//         try {
//           supplierObject = JSON.parse(supplier);
//         } catch {
//           return res.status(400).json({ message: 'Invalid supplier format' });
//         }
//       } else if (typeof supplier === 'object') {
//         supplierObject = supplier;
//       }

//       if (!supplierObject?.name || !supplierObject?.link) {
//         return res
//           .status(400)
//           .json({ message: 'Supplier must have name and link' });
//       }
//     }

//     const newProduct = await productHistoryModel.create({
//       productId: product._id,
//       storeID,
//       purchaseQuantity: purchase || 0,
//       receiveQuantity: received || 0,
//       lostQuantity: lost || 0,
//       sendToWFS: sentToWfs || 0,
//       costOfPrice: costOfPrice || 0,
//       status: status || '',
//       orderId: orderId || '',
//       sellPrice: sellPrice || 0,
//       date: date || new Date(),
//       email: email || '',
//       card: card || '',
//       supplier: supplierObject,
//     });

//     await productModel.updateOne(
//       { _id: product._id },
//       {
//         $inc: {
//           available: +purchase - lost,
//         },
//       }
//     );

//     res.status(201).json({
//       newProduct,
//       success: true,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

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
  req: StoreAccessRequest | any, // Changed to StoreAccessRequest
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

// export const updateSingleField = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const { id } = req.params;
//   const { field, value } = req.body;

//   try {
//     const validFields = [
//       'orderId',
//       'purchaseQuantity',
//       'receiveQuantity',
//       'lostQuantity',
//       'sendToWFS',
//       'costOfPrice',
//       'sellPrice',
//       'date',
//       'status',
//       'card',
//       'email',
//       'status',
//       'supplier',
//       'upc',
//     ];

//     if (!validFields.includes(field)) {
//       return res.status(400).json({ message: 'Invalid field name' });
//     }

//     let updateObj;
//     if (field === 'supplier') {
//       let supplierData;

//       try {
//         supplierData = JSON.parse(value);
//       } catch {
//         return res
//           .status(400)
//           .json({ message: 'Invalid JSON format for supplier' });
//       }

//       if (!supplierData.supplierName || !supplierData.supplierLink) {
//         return res
//           .status(400)
//           .json({ message: 'Missing supplier name or link' });
//       }

//       updateObj = {
//         supplier: {
//           name: supplierData.supplierName,
//           link: supplierData.supplierLink,
//         },
//         updatedAt: new Date(),
//       };
//     } else {
//       // Default single field update
//       updateObj = {
//         [field]: value,
//         updatedAt: new Date(),
//       };
//     }

//     const updatedProduct = await productHistoryModel.findByIdAndUpdate(
//       id,
//       updateObj,
//       { new: true }
//     );

//     if (!updatedProduct) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     res.status(200).json({
//       message: `${field} updated successfully`,
//       updatedProduct,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

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
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Read the file with proper options
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      sheetStubs: true,
    });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with explicit header row handling
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
      range: 2, // Skip the first two rows (formulas and headers)
      defval: null,
      raw: false, // Get formatted strings
    });

    // console.log('First few rows of parsed data:', data.slice(0, 5));

    const bulkUpdates = [];
    const bulkInserts = [];
    const skippedProducts = [];
    const errors = [];

    for (const [index, row] of data.entries()) {
      try {
        // Skip empty rows or rows without essential data
        if (!row.upc && !row.orderId) continue;

        const upc = String(row.upc || '').trim();
        if (!upc || upc === 'UPC') continue;

        // Find product by SKU or UPC
        const product = await productModel.findOne({
          $or: [{ sku: upc }, { upc: upc }],
        });

        if (!product) {
          skippedProducts.push({ upc, row });
          continue;
        }

        // Helper function to safely parse numbers
        const parseNumber = (value: any) => {
          if (value === null || value === undefined || value === '') return 0;
          if (typeof value === 'string' && value.startsWith('=')) return 0;
          const num = Number(value);
          return isNaN(num) ? 0 : num;
        };
        const parseNumber2 = (value: any) => {
          if (value === null || value === undefined || value === '') return 0;
          if (typeof value === 'string') {
            value = value.replace(/[$,]/g, '').trim();
          }
          const num = Number(value);
          return isNaN(num) ? 0 : num;
        };

        const orderId = String(row.orderId || '').trim();
        const purchaseQuantity = parseNumber(row.purchase);
        const receiveQuantity = parseNumber(row.received);
        const lostQuantity = parseNumber(row.lostDamaged);
        const sendToWFS = parseNumber(row.sentToWfs);
        const costOfPrice = parseNumber2(row.costPerItem);

        // First try to find existing records with zero quantities
        const zeroQuantityItem = await productHistoryModel.findOne({
          productId: product._id,
          storeID: req.body.storeID,
          purchaseQuantity: 0,
          receiveQuantity: 0,
          lostQuantity: 0,
          sendToWFS: 0,
        });

        if (zeroQuantityItem) {
          // Update the existing zero-quantity record
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
                  costOfPrice,
                  totalPrice: String(row.totalCost || '0'),
                  date: row.date ? new Date(row.date) : new Date(),
                  status: String(row.status || ''),
                  upc: upc,
                  supplier: {
                    name: '',
                    link: String(row.link || ''),
                  },
                  email: '',
                  card: '',
                  sellPrice: 0,
                },
              },
            },
          });
        } else {
          // Check if exact record already exists (non-zero quantities)
          const existingItem = await productHistoryModel.findOne({
            productId: product._id,
            storeID: req.body.storeID,
            orderId,
          });

          if (!existingItem) {
            // Insert new record
            bulkInserts.push({
              productId: product._id,
              storeID: req.body.storeID,
              orderId,
              purchaseQuantity,
              receiveQuantity,
              lostQuantity,
              sendToWFS,
              costOfPrice,
              totalPrice: String(row.totalCost || '0'),
              date: row.date ? new Date(row.date) : new Date(),
              status: String(row.status || ''),
              upc: upc,
              supplier: {
                name: '',
                link: String(row.link || ''),
              },
              email: '',
              card: '',
              sellPrice: 0,
            });
          }
          // Else: exact record exists, skip it
        }
      } catch (error: any) {
        errors.push({
          rowIndex: index,
          row,
          error: error.message,
        });
      }
    }

    console.log(`Processing results:
      - Updates: ${bulkUpdates.length}
      - Inserts: ${bulkInserts.length}
      - Skipped products: ${skippedProducts.length}
      - Errors: ${errors.length}`);

    // Execute bulk operations
    const updateResults =
      bulkUpdates.length > 0
        ? await productHistoryModel.bulkWrite(bulkUpdates)
        : null;

    const insertResults =
      bulkInserts.length > 0
        ? await productHistoryModel.insertMany(bulkInserts, { ordered: false })
        : null;

    res.status(200).json({
      success: true,
      message: `Processed ${bulkUpdates.length + bulkInserts.length} records`,
      details: {
        updated: bulkUpdates.length,
        inserted: bulkInserts.length,
        skippedProducts: skippedProducts.length,
        errors: errors.length,
      },
      updateResults: updateResults
        ? {
            matchedCount: updateResults.matchedCount,
            modifiedCount: updateResults.modifiedCount,
          }
        : null,
      insertResults: insertResults ? { count: bulkInserts.length } : null,
      skippedProducts: skippedProducts.slice(0, 10),
      updateProduct: bulkUpdates,
      sampleErrors: errors.slice(0, 5),
    });
  } catch (err) {
    console.error('Processing failed:', err);
    next(err);
  }
};
