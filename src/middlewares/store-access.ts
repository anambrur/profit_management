// src/middleware/store-access.middleware.ts
import { NextFunction, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import { checkStoreAccess } from '../utils/store-access';
import { StoreAccessRequest } from '../types/store-access';

export const requireStoreAccess = expressAsyncHandler(
  async (req: StoreAccessRequest, res: Response, next: NextFunction) => {
    try {
      const storeId = getStoreIdFromRequest(req);

      if (!storeId) {
        throw createHttpError.BadRequest('Store ID is required');
      }

      if (!req.user) {
        throw createHttpError.Unauthorized('Authentication required');
      }

      const hasAccess = await checkStoreAccess(req.user, storeId);
      if (!hasAccess) {
        throw createHttpError.Forbidden('No permission to access this store');
      }

      // Attach store ID to request for downstream use
      req.storeId = storeId;
      next();
    } catch (error) {
      next(error);
    }
  }
);

// Helper function to extract store ID from request
function getStoreIdFromRequest(req: StoreAccessRequest): string | null {
  const storeId = req.params.storeId || req.query.storeId;
  return storeId?.toString().trim() || null;
}
