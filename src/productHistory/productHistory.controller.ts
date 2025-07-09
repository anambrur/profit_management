import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Product from '../product/product.model.js';
import { ProductHistoryRow } from '../types/types.js';
import productHistoryModel from './productHistory.model.js';
export const createProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      storeID,
      purchase,
      received,
      lost,
      sentToWfs,
      costOfPrice,
      orderId,
      sellPrice,
      date,
      status,
      email,
      card,
      supplier,
    } = req.body;

    // Check if product exists
    const product = await Product.findById(id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }

    // Handle supplier (could be stringified JSON or object)
    let supplierObject: { name: string; link: string } | undefined;

    if (supplier) {
      if (typeof supplier === 'string') {
        try {
          supplierObject = JSON.parse(supplier);
        } catch {
          return res.status(400).json({ message: 'Invalid supplier format' });
        }
      } else if (typeof supplier === 'object') {
        supplierObject = supplier;
      }

      if (!supplierObject?.name || !supplierObject?.link) {
        return res
          .status(400)
          .json({ message: 'Supplier must have name and link' });
      }
    }

    const newProduct = await productHistoryModel.create({
      productId: product._id,
      storeID,
      purchaseQuantity: purchase || 0,
      receiveQuantity: received || 0,
      lostQuantity: lost || 0,
      sendToWFS: sentToWfs || 0,
      costOfPrice: costOfPrice || 0,
      status: status || '',
      orderId: orderId || '',
      sellPrice: sellPrice || 0,
      date: date || new Date(),
      email: email || '',
      card: card || '',
      supplier: supplierObject,
    });

    res.status(201).json({ newProduct, success: true });
  } catch (error) {
    next(error);
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

export const getAllProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
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

    if (storeID && mongoose.Types.ObjectId.isValid(storeID)) {
      pipeline.push({
        $match: { storeID: new mongoose.Types.ObjectId(storeID) },
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

    // ✅ Clone for count & aggregation
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

    // ✅ Pagination
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
  const { id } = req.params;
  const { field, value } = req.body;

  try {
    const validFields = [
      'orderId',
      'purchaseQuantity',
      'receiveQuantity',
      'lostQuantity',
      'sendToWFS',
      'costOfPrice',
      'sellPrice',
      'date',
      'status',
      'card',
      'email',
      'status',
      'supplier',
      'upc',
    ];

    if (!validFields.includes(field)) {
      return res.status(400).json({ message: 'Invalid field name' });
    }

    let updateObj;
    if (field === 'supplier') {
      let supplierData;

      try {
        supplierData = JSON.parse(value);
      } catch {
        return res
          .status(400)
          .json({ message: 'Invalid JSON format for supplier' });
      }

      if (!supplierData.supplierName || !supplierData.supplierLink) {
        return res
          .status(400)
          .json({ message: 'Missing supplier name or link' });
      }

      updateObj = {
        supplier: {
          name: supplierData.supplierName,
          link: supplierData.supplierLink,
        },
        updatedAt: new Date(),
      };
    } else {
      // Default single field update
      updateObj = {
        [field]: value,
        updatedAt: new Date(),
      };
    }

    const updatedProduct = await productHistoryModel.findByIdAndUpdate(
      id,
      updateObj,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      message: `${field} updated successfully`,
      updatedProduct,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductHistoryList = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const id = req.params.id;
  try {
    const product = await Product.findById(id);
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

// controllers/productHistoryController.ts
// export const bulkUploadProductHistory = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'No file uploaded' });
//     }

//     // Read the file with proper options
//     const workbook = xlsx.read(req.file.buffer, {
//       type: 'buffer',
//       cellDates: true,
//       sheetStubs: true,
//     });

//     // Get the first sheet
//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];

//     // Convert to JSON with explicit header row handling
//     const data = xlsx.utils.sheet_to_json(worksheet, {
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
//       range: 2, // Skip the first two rows (formulas and headers)
//       defval: null,
//       raw: false, // Get formatted strings
//     });

//     console.log('First few rows of parsed data:', data.slice(0, 5));

//     const bulkData = [];
//     const skippedProducts = [];
//     const errors = [];
//     const existingItems = [];

//     for (const [index, row] of data.entries()) {
//       try {
//         // Skip empty rows or rows without essential data
//         if (!row.upc && !row.orderId) continue;

//         const upc = String(row.upc || '').trim();
//         if (!upc || upc === 'UPC') continue; // Skip header row if it slipped through

//         // const product = await Product.findOne({ sku: upc });
//         const product = await Product.findOne({
//           $or: [{ sku: upc }, { upc: upc }],
//         });

//         if (!product) {
//           skippedProducts.push({ upc, row });
//           continue;
//         }

//         // Check if the item already exists
//         const existingItem = await productHistoryModel.findOne({
//           productId: product._id,
//           storeID: req.body.storeID,
//           orderId: String(row.orderId || '').trim(),
//         });
//         if (existingItem) {
//           existingItems.push({ upc, row });
//           continue;
//         }

//         // Helper function to safely parse numbers
//         const parseNumber = (value: any) => {
//           if (value === null || value === undefined || value === '') return 0;
//           if (typeof value === 'string' && value.startsWith('=')) return 0;
//           const num = Number(value);
//           return isNaN(num) ? 0 : num;
//         };

//         const history = {
//           productId: product._id,
//           storeID: req.body.storeID,
//           orderId: String(row.orderId || '').trim(),
//           purchaseQuantity: parseNumber(row.purchase),
//           receiveQuantity: parseNumber(row.received),
//           lostQuantity: parseNumber(row.lostDamaged),
//           sendToWFS: parseNumber(row.sentToWfs),
//           costOfPrice: parseNumber(row.costPerItem),
//           totalPrice: String(row.totalCost || '0'),
//           date: row.date ? new Date(row.date) : new Date(),
//           status: String(row.status || ''),
//           upc: upc,
//           supplier: {
//             name: '', // You can add supplier name if available
//             link: String(row.link || ''),
//           },
//           email: '',
//           card: '',
//           sellPrice: 0,
//         };

//         bulkData.push(history);
//       } catch (error) {
//         errors.push({
//           rowIndex: index,
//           row,
//           error: error.message,
//         });
//       }
//     }

//     console.log(`Processing results:
//       - Valid records: ${bulkData.length}
//       - Skipped products: ${skippedProducts.length}
//       - Existing items: ${existingItems.length}
//       - Errors: ${errors.length}`);

//     if (bulkData.length > 0) {
//       await productHistoryModel
//         .insertMany(bulkData, { ordered: false })
//         .catch((err) => {
//           console.error('Bulk insert error:', err);
//           errors.push({ error: 'Bulk insert failed', details: err.message });
//         });
//     }

//     res.status(200).json({
//       success: true,
//       message: `${bulkData.length} records processed`,
//       details: {
//         inserted: bulkData.length,
//         skippedProducts: skippedProducts.length,
//         existingItems: existingItems.length,
//         errors: errors.length,
//       },
//       skippedProducts: skippedProducts.slice(0, 10), // Only return first 10 for response
//       existingItems: existingItems.slice(0, 10),
//       sampleErrors: errors.slice(0, 5),
//     });
//   } catch (err) {
//     console.error('Processing failed:', err);
//     next(err);
//   }
// };

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
        const product = await Product.findOne({
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
