import axios from 'axios';
import { v4 as uuid } from 'uuid';
import storeModel from '../store/store.model';
import { Order } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';
import { generateAuthorizationToken } from '../utils/generateAuthorizationToken';

const syncFulfillmentsFromAPI = async (storeId: string) => {
  try {
    // 1. Get store credentials from DB
    const store = await storeModel.findById(storeId);
    if (!store) {
      console.error('Store not found');
      return null;
    }

    const correlationId = uuid(); // Better variable name for logging/debugging

    // 2. Generate tokens
    const authorizationToken = generateAuthorizationToken(
      store.storeClientId,
      store.storeClientSecret
    );
    const accessToken = await generateAccessToken(
      store.storeClientId,
      store.storeClientSecret
    );

    console.log('Authorization Token:', authorizationToken);
    console.log('Access Token:', accessToken);

    // 3. Fetch orders from Walmart Marketplace
    const res = await axios.get(
      'https://marketplace.walmartapis.com/v3/fulfillment/orders-fulfillments/status',
      {
        params: {
          limit: 50,
          offset: 50, // ⛏️ Suggest using 0 instead of 50 unless you want to skip the first 50 orders
        },
        headers: {
          'WM_SEC.ACCESS_TOKEN': accessToken,
          'WM_CONSUMER.CHANNEL.TYPE': 'PARTNER',
          'WM_QOS.CORRELATION_ID': correlationId,
          'WM_SVC.NAME': 'Walmart Marketplace',
          Authorization: authorizationToken,
        },
      }
    );

    const apiItems: Order[] = res.data.ItemResponse || [];
    console.log(`✅ Synced ${apiItems.length} orders from API`);

    console.log(apiItems);
  } catch (err: any) {
    console.error('❌ Sync Error:', err?.response?.data || err.message || err);
    return null;
  }
};

export default syncFulfillmentsFromAPI;
