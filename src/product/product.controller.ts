import type { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import syncItemsFromAPI from '../service/syncItemsFromAPI.service';
import storeModel from '../store/store.model';
import productModel from './product.model';

export const getAllProducts = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await storeModel.find({ storeStatus: 'active' });

      // Step 1: Fetch orders from all active stores
      for (const store of stores) {
        try {
          const data = await syncItemsFromAPI(
            store.storeId,
            store.storeClientId,
            store._id.toString(),
            store.storeClientSecret
          );
          if (!data) {
            return next(
              createHttpError(
                404,
                'No products found or no new products to sync'
              )
            );
          }

          res.status(200).json({
            success: true,
            message: 'Products synchronized successfully',
            data,
            count: data.length,
          });
          // allStoreOrders.push(...data);
        } catch (error) {
          console.error(`Error syncing products for store ${store.storeId}:`);
          continue;
        }
      }
    } catch (error) {
      console.error('Product synchronization failed:', error);
      next(createHttpError(500, 'Failed to synchronize products'));
    }
  }
);

// export const updateProduct = expressAsyncHandler(
//   // @ts-ignore
//   async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const { id } = req.params;
//       const { price, sellPrice, costOfPrice } = req.body;

//       // Update the product with the new prices
//       const product = await productModel.findByIdAndUpdate(
//         id,
//         {
//           $set: {
//             price,
//             sellPrice,
//             costOfPrice,
//           },
//         },
//         { new: true }
//       );

//       if (!product) {
//         return res.status(404).json({
//           success: false,
//           message: 'Product not found',
//         });
//       }

//       // Find all orders that contain this product
//       const orders = await orderModel.find({
//         'products.productSKU': product.sku,
//       });

//       // If you want to update prices in orders as well, you would do it here
//       if (orders.length > 0) {
//         // Example: Update all order items with this product's SKU
//         await orderModel.updateMany(
//           { 'products.productSKU': product.sku },
//           {
//             $set: {
//               'products.$[elem].PurchasePrice': costOfPrice,
//               'products.$[elem].sellPrice': sellPrice,
//             },
//           },
//           {
//             arrayFilters: [{ 'elem.productSKU': product.sku }],
//           }
//         );
//       }

//       return res.status(200).json({
//         success: true,
//         product,
//         updatedOrdersCount: orders.length,
//         message: 'Product and related orders updated successfully',
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
// );

// export const getSingleProduct = expressAsyncHandler(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const id = req.params.id;
//     try {
//       const product = await productModel.findById(id);
//       if (!product) {
//         return next(createHttpError(404, 'Product not found'));
//       }
//       res.status(200).json({ product, success: true });
//     } catch (error) {
//       next(error);
//     }
//   }
// );

// export const addSingleProductHistory = expressAsyncHandler(
//   async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const { id } = req.params;
//       const { quantity, costOfPrice, email, date, sellPrice } = req.body;

//       // Find the product
//       const product = await productModel.findById(id);
//       if (!product) {
//         return next(createHttpError(404, 'Product not found'));
//       }

//       // Prepare update data
//       const updateData = {
//         quantity: quantity ?? 0,
//         costOfPrice: costOfPrice ?? 0,
//         sellPrice: sellPrice ?? product.purchaseHistory[0]?.sellPrice ?? 0,
//         date: date ? new Date(date) : new Date(),
//         email: email ?? '',
//       };

//       let updateOperation;

//       if (
//         product.purchaseHistory.length === 1 &&
//         product.purchaseHistory[0].quantity === 0 &&
//         product.purchaseHistory[0].costOfPrice === 0
//       ) {
//         // First update - modify the default empty object
//         updateOperation = {
//           $set: {
//             'purchaseHistory.0': updateData,
//           },
//         };
//       } else {
//         // Subsequent updates - push new object
//         updateOperation = {
//           $push: {
//             purchaseHistory: updateData,
//           },
//         };
//       }

//       const updatedProduct = await productModel.findByIdAndUpdate(
//         id,
//         updateOperation,
//         { new: true }
//       );

//       res.status(200).json({
//         message: 'Purchase history updated successfully',
//         success: true,
//         product: updatedProduct,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
// );

export const getMyDbAllProduct = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: any = {};
      const escapeRegex = (text: string) =>
        text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      if (req.query.search) {
        const rawSearch = String(req.query.search).trim();
        const safeSearch = escapeRegex(rawSearch);
        const regex = new RegExp(safeSearch, 'i');
        query.$or = [
          { productName: regex },
          { title: regex },
          { sku: regex },
          { upc: regex },
        ];
      }

      if (req.query.availability) {
        query.availability = String(req.query.availability);
      }

      if (req.query.storeID) {
        query.storeID = String(req.query.storeID);
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const skip = (page - 1) * limit;

      const [products, total] = await Promise.all([
        productModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        productModel.countDocuments(query),
      ]);

      res.status(200).json({
        success: true,
        message: 'All Product',
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }
);
