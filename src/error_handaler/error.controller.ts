/* eslint-disable @typescript-eslint/no-explicit-any */
import expressAsyncHandler from 'express-async-handler';
import { NextFunction, Response } from 'express';
import createHttpError from 'http-errors';
import storeModel from '../store/store.model.js';
import stockAlertModel from './stockAlert.model.js';
import { StoreAccessRequest } from '../types/store-access.js';
import { checkStoreAccess } from '../utils/store-access.js';
import failedOrderModel from './failedOrder.model.js';
import { FailedProductUploadModel } from './failedProductUpload.model.js';

//stock alerts
export const getAllStockAlerts = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      const {
        storeId = '',
        search = '',
      } = req.query as {
        storeId?: string;
        search?: string;
      };

      const filter: any = {};

      // Handle multiple storeId(s)
      let storeIds: string[] = [];
      if (storeId) {
        storeIds = storeId.split(',').map((id) => id.trim());

        // Check if user has access to all requested stores
        const unauthorized = storeIds.some((id) => !checkStoreAccess(user, id));
        if (unauthorized) {
          return next(createHttpError(403, 'No access to one or more stores'));
        }

        filter.storeId = { $in: storeIds };
      } else {
        // Filter based on user allowed stores
        const allowedStores = await storeModel
          .find({ _id: { $in: user.allowedStores } })
          .select('storeId -_id');

        filter.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }

      // Add search filter
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        filter.$or = [{ sku: searchRegex }, { orderId: searchRegex }];
      }

      // Add reason filter
      if (reason) {
        filter.reason = reason;
      }

      // Create aggregation pipeline
      const aggregationPipeline: any[] = [
        { $match: filter },
        {
          $lookup: {
            from: 'stores',
            localField: 'storeObjectId',
            foreignField: '_id',
            as: 'storeDetails',
          },
        },
        { $unwind: '$storeDetails' },
        {
          $group: {
            _id: {
              storeId: '$storeId',
              storeObjectId: '$storeObjectId',
              sku: '$sku',
              reason: '$reason',
              details: '$details',
              storeName: '$storeDetails.storeName', // Include storeName in grouping
            },
            totalQuantityNeeded: { $sum: '$quantityNeeded' },
            totalQuantityAvailable: { $sum: '$quantityAvailable' },
            firstDate: { $first: '$date' },
            lastDate: { $last: '$date' },
            orderIds: { $push: '$orderId' },
            reasons: { $push: '$reason' },
            detailsList: { $push: '$details' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            storeId: '$_id.storeId',
            storeObjectId: '$_id.storeObjectId',
            sku: '$_id.sku',
            reason: '$_id.reason',
            details: '$_id.details',
            storeName: '$_id.storeName', // Get storeName from the _id grouping
            totalQuantityNeeded: '$totalQuantityNeeded',
            totalQuantityAvailable: '$totalQuantityAvailable',
            firstDate: 1,
            lastDate: 1,
            orderCount: '$count',
            orderIds: 1,
            reasons: 1,
            detailsList: 1,
          },
        },
        { $sort: { lastDate: -1 } },
        { $skip: skip },
        { $limit: limit },
      ];

      // Get both aggregated results and total count
      const [totalQuery, stockAlerts] = await Promise.all([
        stockAlertModel.aggregate([
          { $match: filter },
          {
            $group: {
              _id: {
                storeId: '$storeId',
                sku: '$sku',
                reason: '$reason',
              },
            },
          },
          { $count: 'total' },
        ]),
        stockAlertModel.aggregate(aggregationPipeline),
      ]);

      const total = totalQuery.length > 0 ? totalQuery[0].total : 0;

      res.status(200).json({
        success: true,
        stockAlerts,
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

//fail orders
export const getAllFailOrders = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      const { storeId = '' } = req.query as {
        storeId?: string;
      };

      const filter: any = {};

      // 🔥 Handle multiple storeId(s)
      let storeIds: string[] = [];
      if (storeId) {
        storeIds = storeId.split(',').map((id) => id.trim());

        // 🔒 Check if user has access to all requested stores
        const unauthorized = storeIds.some((id) => !checkStoreAccess(user, id));
        if (unauthorized) {
          return next(createHttpError(403, 'No access to one or more stores'));
        }

        filter.storeId = { $in: storeIds };
      } else {
        // 🛡 Filter based on user allowed stores
        const allowedStores = await storeModel
          .find({ _id: { $in: user.allowedStores } })
          .select('storeId -_id');

        filter.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }

      const [total, failedOrders] = await Promise.all([
        failedOrderModel.countDocuments(filter),
        failedOrderModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate({
            path: 'storeObjectId',
            select: 'storeName', // Only include storeName field
          }),
      ]);

      res.status(200).json({
        success: true,
        failedOrders,
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

//fail uploads results
export const failedUploadsResult = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Number(req.query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      const { storeId = '' } = req.query as {
        storeId?: string;
      };

      const filter: any = {};

      // 🔥 Handle multiple storeId(s)
      let storeIds: string[] = [];
      if (storeId) {
        storeIds = storeId.split(',').map((id) => id.trim());

        // 🔒 Check if user has access to all requested stores
        const unauthorized = storeIds.some((id) => !checkStoreAccess(user, id));
        if (unauthorized) {
          return next(createHttpError(403, 'No access to one or more stores'));
        }

        filter.storeId = { $in: storeIds };
      } else {
        // 🛡 Filter based on user allowed stores
        const allowedStores = await storeModel
          .find({ _id: { $in: user.allowedStores } })
          .select('storeId -_id');

        filter.storeId = {
          $in: allowedStores.map((store) => store.storeId),
        };
      }

      const [total, failedUploadsResults] = await Promise.all([
        FailedProductUploadModel.countDocuments(filter),
        FailedProductUploadModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate({
            path: 'storeObjectId',
            select: 'storeName', // Only include storeName field
          }),
      ]);

      res.status(200).json({
        success: true,
        failedUploadsResults,
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
