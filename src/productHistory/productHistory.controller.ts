/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import productModel from '../product/product.model.js';
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

    const storeIDParam = req.query.storeID as string | undefined;
    let storeIDs: mongoose.Types.ObjectId[] | undefined = undefined;
    if (storeIDParam) {
      storeIDs = storeIDParam
        .split(',')
        .map((id) => new mongoose.Types.ObjectId(id.trim()));
    }
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
    if (storeIDs && storeIDs.length > 0) {
      // If specific store is requested, verify access
      for (const id of storeIDs) {
        if (!checkStoreAccess(user, id.toHexString())) {
          return next(
            createHttpError(403, `No access to store ${id.toHexString()}`)
          );
        }
      }
      pipeline.push({
        $match: { storeID: { $in: storeIDs } },
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

// export const bulkUploadProductHistory = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   // Validate request first
//   if (!req.file) {
//     return res.status(400).json({ message: 'No file uploaded' });
//   }

//   // Parse the file outside the transaction to minimize transaction time
//   let data: ProductHistoryRow[];
//   try {
//     const workbook = xlsx.read(req.file.buffer, {
//       type: 'buffer',
//       cellDates: true,
//       sheetStubs: true,
//     });

//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];

//     data = xlsx.utils.sheet_to_json<ProductHistoryRow>(worksheet, {
//       header: [
//         'date', // A
//         'orderId', // B
//         'upc', // C
//         'purchase', // D (Purchased)
//         '', // E (Received) - add this if you need it
//         'lost', // F (Lost/Damaged)
//         'sentToWfs', // G (Sent to wfs)
//         '', // H (Remaining) - skip
//         'costPerItem', // I (Cost per item)
//         '', // J (Total cost) - skip
//         '', // K (Sent to wfs cost) - skip
//         '', // L (Remaining) - skip
//         'status', // M (Status)
//       ],
//       range: 2,
//       defval: null,
//       raw: false,
//     });
//   } catch (err) {
//     return res.status(400).json({ message: 'Invalid file format' });
//   }

//   // console.log('XL-DATA', data);
//   // Pre-process data to find unique UPCs and orderIds
//   const uniqueUpcs = new Set<string>();
//   const orderIdSet = new Set<string>();
//   const validRows: ProductHistoryRow[] = [];

//   for (const row of data) {
//     if (!row.upc && !row.orderId) continue;

//     const upc = String(row.upc || '').trim();
//     if (!upc || upc === 'UPC') continue;

//     const orderId = String(row.orderId || '').trim();
//     if (orderId && orderIdSet.has(orderId)) continue;

//     orderIdSet.add(orderId);
//     uniqueUpcs.add(upc);
//     validRows.push(row);
//   }

//   if (validRows.length === 0) {
//     return res.status(400).json({ message: 'No valid rows found' });
//   }

//   const { storeId } = (await storeModel
//     .findById(req.body.storeID)
//     .select('-_id storeId')
//     .lean()) as { storeId: string };

//   // Get all products in a single query before transaction
//   const products = await productModel.find({
//     storeId,
//     $or: [
//       { sku: { $in: Array.from(uniqueUpcs) } },
//       { upc: { $in: Array.from(uniqueUpcs) } },
//     ],
//   });

//   if (products.length === 0) {
//     return res.status(400).json({ message: 'No products found' });
//   }

//   const productMap = new Map<string, any>();
//   products.forEach((p) => {
//     if (p.sku) productMap.set(p.sku, p);
//     if (p.upc) productMap.set(p.upc, p);
//   });

//   // Start transaction only for database operations
//   const session = await mongoose.startSession();
//   session.startTransaction({
//     maxCommitTimeMS: 60000, // 60 seconds timeout
//     readConcern: { level: 'local' }, // Less strict than snapshot
//     writeConcern: { w: 'majority', wtimeout: 5000 },
//   });

//   try {
//     const bulkUpdates = [];
//     const bulkInserts = [];
//     const availableUpdates = new Map<string, number>();
//     const skippedProducts = [];
//     const errors = [];
//     const processedProductQuantities = new Map<string, Set<string>>();

//     // Get recent sell prices in a single query
//     const recentHistories = await productHistoryModel
//       .find({
//         storeID: req.body.storeID,
//         upc: { $in: Array.from(uniqueUpcs) },
//       })
//       .sort({ date: -1 })
//       .session(session);

//     const sellPriceMap = new Map<string, number>();
//     recentHistories.forEach((h) => {
//       if (!sellPriceMap.has(h.upc as string)) {
//         sellPriceMap.set(h.upc as string, h.sellPrice);
//       }
//     });

//     // Process all valid rows
//     for (const row of validRows) {
//       try {
//         const upc = String(row.upc || '').trim();
//         const product = productMap.get(upc);

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
//         const lostQuantity = parseNumber(row.lost);
//         const sendToWFS = parseNumber(row.sentToWfs);
//         const orderId = String(row.orderId || '').trim();
//         const productId = product._id.toString();

//         // Check for existing record
//         const existingItem = await productHistoryModel
//           .findOne({
//             productId: product._id,
//             storeID: req.body.storeID,
//             orderId,
//           })
//           .session(session);

//         if (existingItem) continue;

//         // Track quantity changes
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

//         console.log('quantityKey', quantityKey);
//         console.log('purchaseQuantity', purchaseQuantity);
//         console.log('lostQuantity', lostQuantity);

//         // Check for zero quantity item to update
//         const zeroQuantityItem = await productHistoryModel
//           .findOne({
//             productId: product._id,
//             storeID: req.body.storeID,
//             purchaseQuantity: 0,
//             receiveQuantity: 0,
//             lostQuantity: 0,
//             sendToWFS: 0,
//             orderId: '',
//           })
//           .session(session);

//         if (zeroQuantityItem) {
//           bulkUpdates.push({
//             updateOne: {
//               filter: { _id: zeroQuantityItem._id },
//               update: {
//                 $set: {
//                   orderId,
//                   purchaseQuantity,
//                   lostQuantity,
//                   sendToWFS,
//                   costOfPrice: parseNumber(row.costPerItem),
//                   sellPrice: zeroQuantityItem.sellPrice,
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
//           bulkInserts.push({
//             productId: product._id,
//             storeID: req.body.storeID,
//             orderId,
//             purchaseQuantity,
//             lostQuantity,
//             sendToWFS,
//             costOfPrice: parseNumber(row.costPerItem),
//             sellPrice: sellPriceMap.get(upc) || 0,
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
//           row,
//           error: error.message,
//         });
//       }
//     }

//     // Execute all operations in parallel with smaller batches
//     const BATCH_SIZE = 500;
//     const updateBatches = [];
//     const insertBatches = [];

//     for (let i = 0; i < bulkUpdates.length; i += BATCH_SIZE) {
//       updateBatches.push(bulkUpdates.slice(i, i + BATCH_SIZE));
//     }

//     for (let i = 0; i < bulkInserts.length; i += BATCH_SIZE) {
//       insertBatches.push(bulkInserts.slice(i, i + BATCH_SIZE));
//     }

//     const updatePromises = updateBatches.map((batch) =>
//       productHistoryModel.bulkWrite(batch, { session })
//     );
//     const insertPromises = insertBatches.map((batch) =>
//       productHistoryModel.insertMany(batch, { session })
//     );

//     const [updateResults, insertResults] = await Promise.all([
//       updatePromises.length > 0 ? Promise.all(updatePromises) : null,
//       insertPromises.length > 0 ? Promise.all(insertPromises) : null,
//     ]);

//     // Update available quantities in batches
//     if (availableUpdates.size > 0) {
//       const updates = Array.from(availableUpdates.entries());
//       for (let i = 0; i < updates.length; i += BATCH_SIZE) {
//         const batch = updates.slice(i, i + BATCH_SIZE);
//         await productModel.bulkWrite(
//           batch.map(([productId, change]) => ({
//             updateOne: {
//               filter: { _id: new mongoose.Types.ObjectId(productId) },
//               update: {
//                 $inc: { available: change },
//                 $set: { lastInventoryUpdate: new Date() },
//               },
//             },
//           })),
//           { session }
//         );
//       }
//     }

//     await session.commitTransaction();

//     res.status(200).json({
//       success: true,
//       stats: {
//         totalRows: data.length,
//         validRows: validRows.length,
//         updated: bulkUpdates.length,
//         inserted: bulkInserts.length,
//         skippedProductsLength: skippedProducts.length,
//         skippedProducts: skippedProducts,
//         productsUpdated: availableUpdates.size,
//         errors: errors.length,
//       },
//       sampleErrors: errors.slice(0, 5),
//     });
//   } catch (err: any) {
//     await session.abortTransaction();
//     console.error('Bulk upload failed:', {
//       message: err.message,
//       stack: err.stack,
//       code: err.code,
//       name: err.name,
//     });
//     res.status(500).json({
//       success: false,
//       message: 'Bulk upload failed',
//       error: err.message,
//     });
//   } finally {
//     session.endSession();
//   }
// };

export const bulkUploadProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Parse the file
  let data: ProductHistoryRow[];
  try {
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    data = xlsx.utils.sheet_to_json<ProductHistoryRow>(worksheet, {
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
  } catch (err) {
    return res.status(400).json({ message: 'Invalid file format' });
  }

  // Pre-process data
  const uniqueUpcs = new Set<string>();
  const orderIdSet = new Set<string>();
  const validRows: ProductHistoryRow[] = [];

  for (const row of data) {
    if (!row.upc && !row.orderId) continue;

    const upc = String(row.upc || '').trim();
    if (!upc || upc === 'UPC') continue;

    const orderId = String(row.orderId || '').trim();
    if (orderId && orderIdSet.has(orderId)) continue;

    orderIdSet.add(orderId);
    uniqueUpcs.add(upc);
    validRows.push(row);
  }

  if (validRows.length === 0) {
    return res.status(400).json({ message: 'No valid rows found' });
  }

  // Get store info
  const { storeId } = (await storeModel
    .findById(req.body.storeID)
    .select('-_id storeId')
    .lean()) as { storeId: string };

  // Get all products in a single query
  const products = await productModel.find({
    storeId,
    $or: [
      { sku: { $in: Array.from(uniqueUpcs) } },
      { upc: { $in: Array.from(uniqueUpcs) } },
    ],
  });

  if (products.length === 0) {
    return res.status(400).json({ message: 'No products found' });
  }

  // Create product maps
  const productMap = new Map<string, any>();
  const productIdMap = new Map<string, any>(); // Map by product ID
  products.forEach((p) => {
    productIdMap.set(p._id.toString(), p);
    if (p.sku) productMap.set(p.sku, p);
    if (p.upc) productMap.set(p.upc, p);
  });

  // Start transaction
  const session = await mongoose.startSession();
  session.startTransaction({
    maxCommitTimeMS: 60000,
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority', wtimeout: 5000 },
  });

  try {
    const bulkUpdates = [];
    const bulkInserts = [];
    const skippedProducts = [];
    const errors = [];

    // New approach for tracking available quantities
    const productQuantityChanges = new Map<
      string,
      {
        available: number;
        lastInventoryUpdate: Date;
      }
    >();

    // Process all valid rows
    for (const row of validRows) {
      try {
        const upc = String(row.upc || '').trim();
        const product = productMap.get(upc);

        if (!product) {
          skippedProducts.push({ upc, row });
          continue;
        }

        const parseNumber = (value: any): number => {
          if (value === null || value === undefined || value === '') return 0;
          if (typeof value === 'string') {
            if (value.startsWith('=')) return 0;
            value = value.replace(/[^0-9.-]+/g, '');
          }
          const num = Number(value);
          return isNaN(num) ? 0 : num;
        };

        const purchaseQuantity = parseNumber(row.purchase);
        const lostQuantity = parseNumber(row.lost);
        const sendToWFS = parseNumber(row.sentToWfs);
        const orderId = String(row.orderId || '').trim();
        const productId = product._id.toString();

        // Check for existing record
        const existingItem = await productHistoryModel
          .findOne({
            productId: product._id,
            storeID: req.body.storeID,
            orderId,
          })
          .session(session);

        if (existingItem) continue;

        // Update quantity tracking
        if (!productQuantityChanges.has(productId)) {
          productQuantityChanges.set(productId, {
            available: product.available || 0,
            lastInventoryUpdate: new Date(),
          });
        }

        const currentProduct = productQuantityChanges.get(productId)!;
        currentProduct.available += purchaseQuantity - lostQuantity;
        currentProduct.lastInventoryUpdate = new Date();

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

        if (zeroQuantityItem) {
          bulkUpdates.push({
            updateOne: {
              filter: { _id: zeroQuantityItem._id },
              update: {
                $set: {
                  orderId,
                  purchaseQuantity,
                  lostQuantity,
                  sendToWFS,
                  costOfPrice: parseNumber(row.costPerItem),
                  sellPrice: zeroQuantityItem.sellPrice,
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
          bulkInserts.push({
            productId: product._id,
            storeID: req.body.storeID,
            orderId,
            purchaseQuantity,
            lostQuantity,
            sendToWFS,
            costOfPrice: parseNumber(row.costPerItem),
            sellPrice: product.price?.amount || 0,
            date: row.date ? new Date(row.date) : new Date(),
            status: String(row.status || ''),
            upc,
            supplier: { name: '', link: String(row.link || '') },
            email: '',
            card: '',
          });
        }
      } catch (error: any) {
        errors.push({
          row,
          error: error.message,
        });
      }
    }

    // Execute all operations in parallel with smaller batches
    const BATCH_SIZE = 500;

    // Process updates and inserts in parallel
    const [updateResults, insertResults] = await Promise.all([
      bulkUpdates.length > 0
        ? productHistoryModel.bulkWrite(bulkUpdates, {
            session,
            ordered: false,
          })
        : Promise.resolve(null),
      bulkInserts.length > 0
        ? productHistoryModel.insertMany(bulkInserts, { session })
        : Promise.resolve(null),
    ]);

    // Update product quantities in a single bulk operation
    if (productQuantityChanges.size > 0) {
      const productUpdates = Array.from(productQuantityChanges.entries()).map(
        ([productId, { available, lastInventoryUpdate }]) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(productId) },
            update: {
              $set: {
                available,
                lastInventoryUpdate,
              },
            },
          },
        })
      );

      await productModel.bulkWrite(productUpdates, { session });
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      stats: {
        totalRows: data.length,
        validRows: validRows.length,
        updated: bulkUpdates.length,
        inserted: bulkInserts.length,
        skippedProductsLength: skippedProducts.length,
        skippedProducts: skippedProducts,
        productsUpdated: productQuantityChanges.size,
        errors: errors.length,
      },
      sampleErrors: errors.slice(0, 5),
    });
  } catch (err: any) {
    await session.abortTransaction();
    console.error('Bulk upload failed:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
    });
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed',
      error: err.message,
    });
  } finally {
    session.endSession();
  }
};
