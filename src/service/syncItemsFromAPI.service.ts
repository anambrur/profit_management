import { v4 as uuid } from 'uuid';
import productModel from '../product/product.model';
import storeModel from '../store/store.model';
import { Product } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';
import getAllProducts from '../utils/getAllProducts';
const syncItemsFromAPI = async (storeId: string) => {
  try {
    // 1. Get store credentials from DB
    const store = await storeModel.findById(storeId);
    if (!store) return console.error('Store not found');

    const token = await generateAccessToken(
      store.storeClientId,
      store.storeClientSecret
    );
    // // 3. Fetch data from API
    const productsData:Product[] = await getAllProducts(token);

    // // 4. Existing IDs from DB
    const existingItems = await productModel.find({}, 'sku');
    const existingIds = new Set(existingItems.map((item) => item.sku));
    // 5. Filter only NEW items
    const newItems = productsData
      .filter(
        (apiItem: Product) => apiItem.sku && !existingIds.has(apiItem.sku)
      )
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
        shelf: apiItem.shelf,
        productType: apiItem.productType,
        price: apiItem.price,
        publishedStatus: apiItem.publishedStatus,
        lifecycleStatus: apiItem.lifecycleStatus,
        isDuplicate: apiItem.isDuplicate,
      }));

    if (newItems.length === 0) {
      console.log('No new items to insert. All data already exists.');
    } else {
      const result = await productModel.insertMany(newItems);
      console.log(`Inserted ${result.length} new items`);
      return result;
    }
  } catch (err) {
    // console.error('Sync Error:', err);
  }
};

export default syncItemsFromAPI;
