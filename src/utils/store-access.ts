// src/utils/store-access.ts
import { StoreAccessRequest } from '../types/store-access';
import storeModel from '../store/store.model';
import { IUser } from '../types/role-permission';

export const checkStoreAccess = async (
  user: IUser,
  storeId: string
): Promise<boolean> => {
  // Check global permission first (fast path)
  if (await user.hasPermissionTo('store.view')) {
    return true;
  }

  // If no global permission, check specific store access
  // Optimized query - only check if the store exists in user's allowed stores
  const storeExists = await storeModel.exists({
    _id: { $in: user.allowedStores },
    id: storeId,
  });

  return !!storeExists;
};

// Memoized version for better performance
const storeIdCache = new Map<string, string[]>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getUserAllowedStoreIds = async (
  user: IUser
): Promise<string[]> => {
  const cacheKey = user.id.toString();

  // Return cached result if available
  if (storeIdCache.has(cacheKey)) {
    return storeIdCache.get(cacheKey)!;
  }

  let storeIds: string[];

  if (await user.hasPermissionTo('store.view')) {
    // If user has global view permission, get all stores
    const allStores = await storeModel.find().select('_id').lean();
    storeIds = allStores.map((store) => store._id.toString());
  } else {
    // Otherwise get only allowed stores
    storeIds = user.allowedStores.map((id) => id.toString());
  }

  // Cache the result
  storeIdCache.set(cacheKey, storeIds);

  // Set cache expiration
  setTimeout(() => {
    storeIdCache.delete(cacheKey);
  }, CACHE_TTL);

  return storeIds;
};
