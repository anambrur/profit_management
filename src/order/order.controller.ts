// order.controller.ts
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import transformOrdersData from '../service/orderFormator.service';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';
import storeModel from '../store/store.model';
import orderModel from './order.model';

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
      const orders = await orderModel.find({});
      res.status(200).json({ orders, success: true });
    } catch (error) {
      next(error);
    }
  }
);
