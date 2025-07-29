/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import productModel from '../product/product.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js';
import { Product } from '../types/types.js';
import generateAccessToken from '../utils/generateAccessToken.js';
import { v4 as uuid } from 'uuid';

interface ProductSyncResult {
  success: boolean;
  storeId: string;
  data?: {
    newProducts: any[];
    updatedProducts: any[];
    failedProducts: any[];
  };
  meta?: {
    nextCursor?: string | null;
    hasMore?: boolean;
    totalItems?: number;
  };
  error?: string;
}

const syncItemsFromAPI = async (
  storeId: string,
  storeClientId: string,
  storeObjectId: string,
  storeClientSecret: string,
  cursor?: string | null
): Promise<ProductSyncResult> => {
  if (!storeId || !storeClientId || !storeClientSecret) {
    return {
      success: false,
      storeId,
      error: 'Missing required store parameters',
    };
  }

  try {
    // 1. Generate access token
    const token = await generateAccessToken(storeClientId, storeClientSecret);
    if (typeof token !== 'string') {
      return {
        success: false,
        storeId,
        error: 'Failed to generate access token',
      };
    }

    // 2. Fetch paginated data from API
    const correlationId = uuid();
    const params: any = { limit: 200 };
    
    if (cursor && cursor !== '*') {
      params.nextCursor = cursor;
    } else {
      params.nextCursor = '*';
    }

    const res = await axios({
      method: 'GET',
      url: 'https://marketplace.walmartapis.com/v3/items',
      params,
      headers: {
        'WM_SEC.ACCESS_TOKEN': token,
        'WM_QOS.CORRELATION_ID': correlationId,
        'WM_SVC.NAME': 'Walmart Marketplace',
        Accept: 'application/json',
      },
      timeout: 60000,
    });

    if (!res.data?.ItemResponse) {
      return {
        success: false,
        storeId,
        error: 'Invalid response structure from Walmart API',
      };
    }

    const productsData = res.data.ItemResponse || [];
    const nextCursor = res.data.nextCursor || null;
    const hasMore = Boolean(nextCursor);
    const totalItems = res.data.totalItems || 0;

    // 3. Process products
    const existingProducts = await productModel.find({ storeId }).lean();
    const existingSkuMap = new Map(existingProducts.map((p) => [p.sku, p]));

    const newProducts: Product[] = [];
    const updatedProducts: Product[] = [];
    const failedProducts: Product[] = [];

    for (const apiItem of productsData) {
      if (!apiItem.sku) {
        failedProducts.push({ ...apiItem, _syncError: 'Missing SKU' });
        continue;
      }

      const existingProduct = existingSkuMap.get(apiItem.sku);

      if (!existingProduct) {
        newProducts.push(apiItem);
      } else {
        // const needsUpdate = Object.keys(apiItem).some(
        //   (key) =>
        //     existingProduct[key as keyof Product] !==
        //     apiItem[key as keyof Product]
        // );

        // const needsUpdate = Object.keys(apiItem).some((key) => {
        //   // Only compare fields that exist in both objects
        //   if (key in existingProduct && key in apiItem) {
        //     // Special handling for price object
        //     if (key === 'price') {
        //       return (
        //         existingProduct.price?.amount !== apiItem.price?.amount ||
        //         existingProduct.price?.currency !== apiItem.price?.currency
        //       );
        //     }
        //     // @ts-ignore
        //     return existingProduct[key] !== apiItem[key];
        //   }
        //   return false;
        // });

        const needsUpdate = Object.keys(apiItem).some((key) => {
          // Skip internal or special fields
          if (
            key.startsWith('_') ||
            key === 'storeId' ||
            key === 'lastSynced'
          ) {
            return false;
          }

          // Special handling for price object
          if (key === 'price') {
            return (
              existingProduct.price?.amount !== apiItem.price?.amount ||
              existingProduct.price?.currency !== apiItem.price?.currency
            );
          }

          // Compare other fields safely
          const existingValue =
            existingProduct[key as keyof typeof existingProduct];
          const apiValue = apiItem[key as keyof typeof apiItem];

          // Compare only if both values exist
          if (existingValue !== undefined && apiValue !== undefined) {
            return JSON.stringify(existingValue) !== JSON.stringify(apiValue);
          }

          return false;
        });

        if (needsUpdate) updatedProducts.push(apiItem);
      }
    }

    // 4. Database operations
    const session = await productModel.startSession();
    session.startTransaction();

    try {
      // Insert new products
      const insertedProducts =
        newProducts.length > 0
          ? await productModel.insertMany(
              newProducts.map((item) => ({
                ...item,
                storeId,
                price: {
                  amount: item.price?.amount || 0,
                  currency: item.price?.currency || 'USD',
                },
                lastSynced: new Date(),
              })),
              { session }
            )
          : [];

      // Update existing products
      const updateOps = updatedProducts.map((item) => ({
        updateOne: {
          filter: { sku: item.sku, storeId },
          update: {
            $set: {
              ...item,
              price: {
                amount: item.price?.amount || 0,
                currency: item.price?.currency || 'USD',
              },
              lastSynced: new Date(),
              lastUpdated: new Date(),
            },
          },
        },
      }));

      const updatedCount =
        updateOps.length > 0
          ? (await productModel.bulkWrite(updateOps, { session })).modifiedCount
          : 0;

      // Create history records
      const historyRecords = [
        ...insertedProducts.map((product) => ({
          productId: product._id,
          storeID: storeObjectId,
          orderId: '',
          sellPrice: product.price?.amount || 0,
          upc: product.upc || '',
          status: 'synced',
          syncType: 'initial',
          timestamp: new Date(),
        })),
        ...updatedProducts.map((product) => ({
          productId: existingSkuMap.get(product.sku ?? '')?._id,
          storeID: storeObjectId,
          orderId: '',
          sellPrice: product.price?.amount || 0,
          upc: product.upc || '',
          status: 'synced',
          syncType: 'update',
          timestamp: new Date(),
        })),
      ];

      if (historyRecords.length > 0) {
        await productHistoryModel.insertMany(historyRecords, { session });
      }

      await session.commitTransaction();

      return {
        success: true,
        storeId,
        data: {
          newProducts: insertedProducts,
          updatedProducts: updatedProducts.slice(0, updatedCount),
          failedProducts,
        },
        meta: {
          nextCursor,
          hasMore,
          totalItems,
        },
      };
    } catch (dbError: any) {
      await session.abortTransaction();
      return {
        success: false,
        storeId,
        error: `Database operation failed: ${dbError.message}`,
      };
    } finally {
      await session.endSession();
    }
  } catch (err: any) {
    return {
      success: false,
      storeId,
      error: err.message,
    };
  }
};

export default syncItemsFromAPI;
