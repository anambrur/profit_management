/* eslint-disable @typescript-eslint/no-explicit-any */
// order.controller.ts
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import transformOrdersData from '../service/orderFormator.service.js';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service.js';
import storeModel from '../store/store.model.js';
import { StoreAccessRequest } from '../types/store-access';
import { checkStoreAccess } from '../utils/store-access.js';
import orderModel from './order.model.js';


//api singale store order facing
export const processStoreOrders = expressAsyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;
      const cursors: Record<string, string> = {};

      // Extract and decode cursor parameters
      Object.keys(req.query).forEach((key) => {
        if (key.endsWith('_cursor')) {
          const shipNodeType = key.replace('_cursor', '');
          // cursors[shipNodeType] = decodeURIComponent(req.query[key] as string);
          cursors[shipNodeType] = req.query[key] as string;
        }
      });


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

      const result = await syncOrdersFromAPI(
        store.storeId,
        store.storeClientId,
        store.storeClientSecret,
        cursors
      );

      if (result.orders.length === 0) {
        res.status(200).json({
          message: 'No new orders found to process',
          success: true,
          storeId: store.storeId,
          data: {
            stockedAlerts: [],
            failedOrders: [],
            skippedOrders: [],
            createdOrders: [],
          },
          meta: result.meta,
        });
        return;
      }
      

      const { stockedAlerts, failedOrders, skippedOrders, createdOrders } =
        await transformOrdersData(result.orders);

      console.log(`Order processing completed for store ${storeId}`);

      res.status(200).json({
        message: 'Order processing completed',
        success: true,
        storeId: store.storeId,
        status: {
          totalFetched: result.orders.length,
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
        meta: result.meta,
      });
    } catch (error: any) {
      console.error(`Error processing store ${req.params.storeId}:`, error);
      res.status(500).json({
        message:
          error.response?.data?.message || 'Failed to process store orders',
        storeId: req.params.storeId,
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
        success: false,
      });
    }
  }
);

//  get all orders
export const getOrders = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      const {
        search = '',
        storeId,
        status,
      } = req.query as {
        search?: string;
        storeId?: string;
        status?: string;
      };

     

      // Build dynamic filter
      const filter: any = {};

      // Apply store filtering based on user permissions
      if (storeId) {
        // If specific store is requested, verify access
        if (!checkStoreAccess(user, storeId)) {
          return next(createHttpError(403, 'No access to this store'));
        }
        filter.storeId = storeId;
      } else {
        // If no store specified, filter by user's allowed stores
        // Unless user has permission to view all stores
        const allowedStores = await storeModel
          .find({
            _id: { $in: user.allowedStores },
          })
          .select('storeId -_id');

        filter.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }


      // Add status filter if provided
      if (status) {
        filter.status = status;
      }

      if (search) {
        const regex = new RegExp(search, 'i'); // Case-insensitive search
        filter.$or = [
          { customerOrderId: regex },
          { 'products.productName': regex },
          { 'products.productSKU': regex },
        ];
      }

      const [total, orders] = await Promise.all([
        orderModel.countDocuments(filter),
        orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ]);

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
