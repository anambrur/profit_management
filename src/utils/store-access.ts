// src/utils/store-access.ts
import { Request } from 'express';
import { IUser } from '../types/role-permission';

export type StoreAccessRequest = Request & {
  user?: IUser;
  storeId?: string; // For downstream use if needed
};

// Check if user has access to a specific store
export const checkStoreAccess = (user: IUser, storeId: string): boolean => {
  return (
    user.hasPermissionTo('store.view') ||
    user.allowedStores.some((id) => id.toString() === storeId)
  );
};

// Get all store IDs user has access to
export const getUserAllowedStoreIds = (user: IUser): string[] => {
  return user.allowedStores.map((id) => id.toString());
};
