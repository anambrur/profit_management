import axios from 'axios';
import { v4 as uuid } from 'uuid';
import storeModel from '../store/store.model';
import { Product } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';
const syncOrdersFromAPI = async (storeId: string) => {
  try {
    // 1. Get store credentials from DB
    const store = await storeModel.findById(storeId);
    if (!store) return console.error('Store not found');

    const uniqueId = uuid();

    const token = await generateAccessToken(
      store.storeClientId,
      store.storeClientSecret
    );
    console.log(token);

    // // 3. Fetch data from API
    const res = await axios({
      method: 'GET',
      url: 'https://marketplace.walmartapis.com/v3/orders',
      headers: {
        'WM_SEC.ACCESS_TOKEN': token,
        'WM_CONSUMER.CHANNEL.TYPE': 'PARTNER',
        'WM_QOS.CORRELATION_ID': uniqueId,
        'WM_SVC.NAME': 'Walmart Marketplace',
      },
    });
    const apiItems: Product[] = res.data.ItemResponse;
    console.log(apiItems);
    return apiItems;
  } catch (err) {
    console.error('Sync Error:', err);
  }
};

export default syncOrdersFromAPI;
