/* eslint-disable @typescript-eslint/no-explicit-any */
import expressAsyncHandler from 'express-async-handler';
import { checkStoreAccess } from '../utils/store-access';
import { NextFunction, Response } from 'express';
import createHttpError from 'http-errors';
import storeModel from '../store/store.model';
import stockAlertModel from './stockAlert.model';
import { StoreAccessRequest } from '../types/store-access';

export const getAllStockAlerts = expressAsyncHandler(
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

      const [total, orders] = await Promise.all([
        stockAlertModel.countDocuments(filter),
        stockAlertModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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