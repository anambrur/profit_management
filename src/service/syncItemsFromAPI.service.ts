import productModel from '../product/product.model';
import storeModel from '../store/store.model';
import { Product } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';
import getAllProducts from '../utils/getAllProducts';

const syncItemsFromAPI = async (storeId: string) => {
  if (!storeId) {
    throw new Error('Store ID is required');
  }

  try {
    // 1. Get store credentials from DB
    const store = await storeModel.findById(storeId);
    if (!store) {
      throw new Error('Store not found in database');
    }

    if (!store.storeClientId || !store.storeClientSecret) {
      throw new Error('Store credentials are incomplete');
    }

    // 2. Generate access token
    const token = await generateAccessToken(
      store.storeClientId,
      store.storeClientSecret
    );

    if (!token) {
      throw new Error('Failed to generate access token');
    }

    // 3. Fetch data from API
    const productsData: Product[] = await getAllProducts(token);

    if (!productsData || !Array.isArray(productsData)) {
      throw new Error('Invalid products data received from API');
    }

    // 4. Get existing IDs from DB
    const existingItems = await productModel.find({}, 'sku');
    const existingIds = new Set(existingItems.map((item) => item.sku));

    // 5. Filter only NEW items
    const newItems = productsData
      .filter((apiItem: Product) => {
        if (!apiItem.sku) {
          console.warn('Product missing SKU:', apiItem.productName);
          return false;
        }
        return !existingIds.has(apiItem.sku);
      })
      .map((apiItem: Product) => ({
        storeID: store.storeId,
        mart: apiItem.mart,
        sku: apiItem.sku,
        condition: apiItem.condition,
        availability: apiItem.availability,
        wpid: apiItem.wpid,
        upc: apiItem.upc,
        gtin: apiItem.gtin,
        productName: apiItem.productName,
        productType: apiItem.productType,
        publishedStatus: apiItem.publishedStatus,
        lifecycleStatus: apiItem.lifecycleStatus,
        storeRef: store._id,
        purchaseHistory: [
          {
            quantity: 0,
            costOfPrice: 0,
            sellPrice: apiItem.price?.amount || 0,
            date: new Date().toISOString(),
            email: '',
          },
        ],
      }));

    if (newItems.length === 0) {
      console.log('No new items to insert. All data already exists.');
      return []; // Return empty array for consistency
    }

    const result = await productModel.insertMany(newItems);
    console.log(`Inserted ${result.length} new items`);
    return result;
  } catch (err) {
    console.error('Sync Error:', err);
    throw err; // Re-throw to be caught by the controller
  }
};

export default syncItemsFromAPI;
