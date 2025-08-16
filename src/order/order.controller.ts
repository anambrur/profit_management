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
        await transformOrdersData(result.orders, store.storeId, store._id);

      // console.log(`Order processing completed for store ${storeId}`);

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

//api all store order facing
export const getOrders = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      const {
        search = '',
        storeId = '',
        status,
        fromDate,
        toDate,
      } = req.query as {
        search?: string;
        storeId?: string;
        status?: string;
        fromDate?: string;
        toDate?: string;
      };

      const filter: any = {};

      // Handle multiple storeId(s)
      let storeIds: string[] = [];
      if (storeId) {
        storeIds = storeId.split(',').map((id) => id.trim());

        const unauthorized = storeIds.some((id) => !checkStoreAccess(user, id));
        if (unauthorized) {
          return next(createHttpError(403, 'No access to one or more stores'));
        }

        filter.storeId = { $in: storeIds };
      } else {
        const allowedStores = await storeModel
          .find({ _id: { $in: user.allowedStores } })
          .select('storeId -_id');

        filter.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }

      if (status) {
        filter.status = status;
      }

      if (fromDate || toDate) {
        filter.orderDate = {};
        if (fromDate) {
          filter.orderDate.$gte = new Date(fromDate);
        }
        if (toDate) {
          filter.orderDate.$lte = new Date(toDate);
        }
      }

      if (search) {
        const regex = new RegExp(search, 'i');
        filter.$or = [
          { customerOrderId: regex },
          { 'products.productName': regex },
          { 'products.productSKU': regex },
        ];
      }

      // console.log('Final filter:', JSON.stringify(filter, null, 2)); // Debug log

      const [total, orders, sums] = await Promise.all([
        orderModel.countDocuments(filter),
        orderModel.aggregate([
          { $match: filter },
          { $sort: { orderDate: -1 } }, // Move sort before skip/limit
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'stores',
              localField: 'storeId',
              foreignField: 'storeId',
              as: 'storeInfo',
            },
          },
          { $unwind: { path: '$storeInfo', preserveNullAndEmptyArrays: true } },
          { $addFields: { storeName: '$storeInfo.storeName' } },
          { $project: { storeInfo: 0 } },
        ]),
        orderModel.aggregate([
          { $match: filter },
          { $unwind: '$products' },
          {
            $group: {
              _id: null,
              totalSellPrice: {
                $sum: { $toDouble: '$products.sellPrice' },
              },
              totalPurchaseCost: {
                $sum: {
                  $multiply: [
                    { $toDouble: '$products.PurchasePrice' },
                    { $toDouble: '$products.quantity' },
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalSellPrice: { $round: ['$totalSellPrice', 2] },
              totalPurchaseCost: { $round: ['$totalPurchaseCost', 2] },
            },
          },
        ]),
      ]);

      console.log(
        `Found ${total} total orders, returning ${orders.length} orders`
      ); // Debug log

      const sumResult =
        sums.length > 0
          ? sums[0]
          : {
              totalSellPrice: 0,
              totalPurchaseCost: 0,
            };

      res.status(200).json({
        success: true,
        orders,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        sums: sumResult,
      });
    } catch (error) {
      console.error('Error in getOrders:', error); // Debug log
      next(error);
    }
  }
);
