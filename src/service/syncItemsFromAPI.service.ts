import productModel from '../product/product.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js';
import { Product } from '../types/types.js';
import generateAccessToken from '../utils/generateAccessToken.js';
import getAllProducts from '../utils/getAllProducts.js';

const syncItemsFromAPI = async (
  storeId: string,
  storeClientId: string,
  storeObjectId: string,
  storeClientSecret: string
) => {
  if (!storeId) {
    throw new Error('Store ID is required');
  }

  try {
    // 1. Generate access token
    const token = await generateAccessToken(storeClientId, storeClientSecret);
    if (!token) {
      throw new Error('Failed to generate access token');
    }

    // 2. Fetch data from API
    const productsData: Product[] = await getAllProducts(token);
    if (!productsData || !Array.isArray(productsData)) {
      throw new Error('Invalid products data received from API');
    }

    // 3. Get existing SKUs from DB
    const existingItems = await productModel.find({}, 'sku');
    const existingIds = new Set(existingItems.map((item) => item.sku));

    // 4. Filter new items only
    const filteredItems = productsData.filter((apiItem: Product) => {
      if (!apiItem.sku) {
        console.warn('Product missing SKU:', apiItem.productName);
        return false;
      }
      return !existingIds.has(apiItem.sku);
    });

    if (filteredItems.length === 0) {
      console.log('No new items to insert. All data already exists.');
      return [];
    }

    const newProducts = filteredItems.map((apiItem: Product) => ({
      mart: apiItem.mart,
      storeId: storeId,
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
    }));


    // 5. Insert into productModel
    const insertedProducts = await productModel.insertMany(newProducts);

    // 6. Prepare product history records using inserted ObjectIds
    const purchaseHistoryItems = insertedProducts.map((product, index) => ({
      productId: product._id, // <-- This is the actual ObjectId
      storeID: storeObjectId,
      orderId: '',
      purchaseQuantity: 0,
      receiveQuantity: 0,
      lostQuantity: 0,
      costOfPrice: 0,
      sendToWFS: 0,
      sellPrice: filteredItems[index]?.price?.amount || 0,
      totalPrice: 0,
      email: '',
      card: '',
      supplier: {
        name: '',
        link: '',
      },
      status: '',
      upc: filteredItems[index]?.upc || '',
    }));

    // 7. Insert into productHistoryModel
    await productHistoryModel.insertMany(purchaseHistoryItems);
    

    return insertedProducts;
  } catch (err) {
    console.error('❌ Error in syncItemsFromAPI:');
    throw err;
  }
};

export default syncItemsFromAPI;
