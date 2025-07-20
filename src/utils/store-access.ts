// src/utils/store-access.ts
import { Request } from 'express';
import storeModel from '../store/store.model.js';
import { IUser } from '../types/role-permission.js';

export type StoreAccessRequest = Request & {
  user?: IUser;
  storeId?: string; // For downstream use if needed
};

// Check if user has access to a specific store
export const checkStoreAccess = async (
  user: IUser,
  storeId: string
): Promise<boolean> => {
  if (await user.hasPermissionTo('store.view')) {
    return true;
  }

  const allowedStores = await storeModel
    .find({
      _id: { $in: user.allowedStores },
    })
    .select('storeId -_id');

  return allowedStores.some((store) => store.storeId === storeId);
};

// Get all store IDs user has access to
export const getUserAllowedStoreIds = (user: IUser): string[] => {
  return user.allowedStores.map((id) => id.toString());
};
