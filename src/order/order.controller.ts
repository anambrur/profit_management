// order.controller.ts
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import transformOrdersData from '../service/orderFormator.service.js';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service.js';
import storeModel from '../store/store.model.js';
import orderModel from './order.model.js';

export const getAllOrders = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stores = await storeModel.find({ storeStatus: 'active' });
      const allStoreOrders = [];

      // Step 1: Fetch orders from all active stores
      for (const store of stores) {
        try {
          const result = await syncOrdersFromAPI(
            store.storeId,
            store.storeClientId,
            store.storeClientSecret
          );
          allStoreOrders.push(...result);
        } catch (error) {
          console.error(`Error syncing orders for store ${store.storeId}:`);
          continue;
        }
      }

      if (allStoreOrders.length === 0) {
        res.status(200).json({
          message: 'No new orders found to process',
          success: true,
          data: {
            stockedAlerts: [],
            failedOrders: [],
            skippedOrders: [],
            createdOrders: [],
          },
        });
        return;
      }

      // Step 2: Transform and process orders
      const { stockedAlerts, failedOrders, skippedOrders, createdOrders } =
        await transformOrdersData(allStoreOrders);

      // Step 3: Prepare response
      const response = {
        message: 'Order processing completed',
        success: true,
        stats: {
          totalFetched: allStoreOrders.length,
          created: createdOrders.length,
          skipped: skippedOrders.length,
          failed: failedOrders.length,
          stockAlerts: stockedAlerts.length,
        },
        details: {
          stockedAlerts,
          failedOrders,
          skippedOrders,
          createdOrders,
        },
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Error in getAllOrders:', error);
      res.status(500).json({
        message: error.response?.data?.message || 'Failed to process orders',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : null,
        success: false,
        status: 500,
      });
    }
  }
);

//  get all orders
export const getOrders = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse pagination params
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const skip = (page - 1) * limit;

      // Get total count
      const total = await orderModel.countDocuments();

      // Get paginated data
      const orders = await orderModel
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        orders,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  }
);
