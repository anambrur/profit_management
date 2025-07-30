/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import syncItemsFromAPI from '../service/syncItemsFromAPI.service.js';
import storeModel from '../store/store.model.js';
import { StoreAccessRequest } from '../types/store-access';
import { checkStoreAccess } from '../utils/store-access.js';
import productModel from './product.model.js';

export const getAllProducts = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await storeModel.find({ storeStatus: 'active' });

      if (stores.length === 0) {
        return next(createHttpError(404, 'No active stores found'));
      }

      // Define proper types for our sync results
      type SyncSuccessResult = {
        success: true;
        storeId: string;
        data: {
          newProducts: any[];
          updatedProducts: any[];
          failedProducts: any[];
        };
      };

      type SyncErrorResult = {
        success: false;
        storeId: string;
        error: string;
        newProducts: number; // counts instead of arrays
        updatedProducts: number;
        failedProducts: number;
      };

      type SyncResult = SyncSuccessResult | SyncErrorResult;

      // Process all stores in parallel
      const syncResults = await Promise.allSettled(
        stores.map((store) =>
          syncItemsFromAPI(
            store.storeId,
            store.storeClientId,
            store._id.toString(),
            store.storeClientSecret
          ).catch((error): SyncErrorResult => {
            console.error(
              `Error syncing products for store ${store.storeId}:`,
              error
            );
            return {
              success: false,
              storeId: store.storeId,
              error: error.message,
              newProducts: 0,
              updatedProducts: 0,
              failedProducts: 0,
            };
          })
        )
      );

      // Process results with proper type conversion
      const results: SyncResult[] = syncResults.map((result) => {
        if (result.status === 'fulfilled') {
          // Ensure the fulfilled value matches our SyncResult type
          if (result.value.success) {
            return {
              success: true,
              storeId: result.value.storeId,
              data: {
                newProducts: result.value.data?.newProducts || [],
                updatedProducts: result.value.data?.updatedProducts || [],
                failedProducts: result.value.data?.failedProducts || [],
              },
            };
          } else {
            return {
              success: false,
              storeId: result.value.storeId,
              error: result.value.error || 'Unknown error',
              newProducts: 0,
              updatedProducts: 0,
              failedProducts: 0,
            };
          }
        }
        return {
          success: false,
          storeId: 'unknown',
          error: result.reason?.message || 'Unknown error',
          newProducts: 0,
          updatedProducts: 0,
          failedProducts: 0,
        };
      });

      const successfulSyncs = results.filter(
        (result): result is SyncSuccessResult => result.success === true
      );

      const failedSyncs = results.filter(
        (result): result is SyncErrorResult => result.success === false
      );

      // Aggregate all data with proper type safety
      const allNewProducts = successfulSyncs.flatMap(
        (result) => result.data.newProducts
      );
      const allUpdatedProducts = successfulSyncs.flatMap(
        (result) => result.data.updatedProducts
      );
      const allFailedProducts = successfulSyncs.flatMap(
        (result) => result.data.failedProducts
      );

      res.status(200).json({
        success: true,
        message: `Product sync completed for ${stores.length} stores`,
        status: {
          totalStores: stores.length,
          successfulStores: successfulSyncs.length,
          failedStores: failedSyncs.length,
          totalProducts: allNewProducts.length + allUpdatedProducts.length,
          newProducts: allNewProducts.length,
          updatedProducts: allUpdatedProducts.length,
          failedProducts: allFailedProducts.length,
        },
        details: {
          failedSyncs: failedSyncs.map(({ storeId, error }) => ({
            storeId,
            error,
          })),
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      });
    } catch (error) {
      console.error('Product synchronization failed:', error);
      next(createHttpError(500, 'Failed to synchronize products'));
    }
  }
);

// In your product controller file
export const processStoreProducts = expressAsyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { nextCursor } = req.query;

      const store = await storeModel.findOne({
        storeId,
        storeStatus: 'active',
      });

      if (!store) {
        res.status(404).json({
          message: 'Store not found or inactive',
          success: false,
        });
        return;
      }

      const result = await syncItemsFromAPI(
        store.storeId,
        store.storeClientId,
        store._id.toString(),
        store.storeClientSecret,
        nextCursor as string | undefined
      );

      if (!result.success) {
        res.status(500).json({
          message: result.error || 'Failed to process store products',
          success: false,
        });
        return;
      }

      console.log(`Product processing completed for store ${storeId}`);

      res.status(200).json({
        message: 'Product processing completed',
        success: true,
        storeId: store.storeId,
        status: {
          totalItems: result.meta?.totalItems || 0,
          newProducts: result.data?.newProducts.length || 0,
          updatedProducts: result.data?.updatedProducts.length || 0,
          failedProducts: result.data?.failedProducts.length || 0,
        },
        meta: {
          nextCursor: result.meta?.nextCursor || null,
          hasMore: result.meta?.hasMore || false,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        message: error.message || 'Failed to process store products',
        success: false,
      });
    }
  }
);

export const getMyDbAllProduct = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const escapeRegex = (text: string) =>
        text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // 🔍 Build match query
      const match: any = {};

      const rawStoreIds = req.query.storeIds?.toString();
      const individualStoreId = req.query.storeID?.toString();

      if (rawStoreIds) {
        const storeIdsArray = rawStoreIds.split(',');
        for (const storeId of storeIdsArray) {
          if (!checkStoreAccess(user, storeId)) {
            return next(createHttpError(403, `No access to store: ${storeId}`));
          }
        }
        match.storeId = { $in: storeIdsArray };
      } else if (individualStoreId) {
        if (!checkStoreAccess(user, individualStoreId)) {
          return next(createHttpError(403, 'No access to this store'));
        }
        match.storeId = individualStoreId;
      } else if (!(await user.hasPermissionTo('store.view'))) {
        const allowedStores = await storeModel
          .find({ _id: { $in: user.allowedStores } })
          .select('storeId');

        match.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }

      // 🔍 Handle search
      if (req.query.search) {
        const safeSearch = escapeRegex(String(req.query.search).trim());
        const regex = new RegExp(safeSearch, 'i');
        match.$or = [
          { productName: regex },
          { title: regex },
          { sku: regex },
          { upc: regex },
        ];
      }

      // 🔍 Handle availability filter
      if (req.query.availability) {
        match.availability = String(req.query.availability);
      }

      // 📦 Pagination
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      // 🧠 Aggregation with lookup
      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: 'stores',
            localField: 'storeId', // Product.storeId (string)
            foreignField: 'storeId', // Store.storeId (string)
            as: 'store',
          },
        },
        {
          $unwind: {
            path: '$store',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            productName: 1,
            sku: 1,
            upc: 1,
            gtin: 1,
            productType: 1,
            condition: 1,
            wpid: 1,
            lifecycleStatus: 1,
            publishedStatus: 1,
            available: 1,
            storeId: 1,
            storeName: '$store.storeName', // ✅ only store name
            availability: 1,
            createdAt: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ];

      const countPipeline = [{ $match: match }, { $count: 'total' }];

      const [products, countResult] = await Promise.all([
        productModel.aggregate(pipeline),
        productModel.aggregate(countPipeline),
      ]);

      const total = countResult[0]?.total || 0;

      if (!products || products.length === 0) {
        return next(createHttpError(404, 'No products found'));
      }

      res.status(200).json({
        success: true,
        message: 'All Products',
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
        data: products,
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      next(error);
    }
  }
);
