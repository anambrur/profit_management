/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import syncItemsFromAPI from '../service/syncItemsFromAPI.service.js';
import storeModel from '../store/store.model.js';
import productModel from './product.model.js';

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
