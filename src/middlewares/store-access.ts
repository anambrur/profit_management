/* eslint-disable @typescript-eslint/no-explicit-any */
// middleware/store-access.middleware.ts
import { NextFunction, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import { checkStoreAccess, StoreAccessRequest } from '../utils/store-access.js';

export const requireStoreAccess = expressAsyncHandler(
  async (req: StoreAccessRequest | any, res: Response, next: NextFunction) => {
    const storeId = req.params.storeId || req.query.storeId;

    if (!storeId) {
      return next(createHttpError(400, 'Store ID is required'));
    }

    if (!req.user) {
      return next(createHttpError(401, 'Authentication required'));
    }

    if (!checkStoreAccess(req.user, storeId.toString())) {
      return next(
        createHttpError(403, 'You do not have permission to access this store')
      );
    }

    // Attach store ID to request for downstream use if needed
    req.storeId = storeId.toString();

    next();
  }
);
