import axios from 'axios';
import { v4 as uuid } from 'uuid';
import storeModel from '../store/store.model';
import { Order } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';
import { generateAuthorizationToken } from '../utils/generateAuthorizationToken';

const syncOrdersFromAPI = async (storeId: string) => {
  try {
    // 1. Get store credentials from DB
    const store = await storeModel.findById(storeId);
    if (!store) {
      console.error('Store not found');
      return null;
    }

    const correlationId = uuid();

    // 2. Generate tokens
    const authorizationToken = generateAuthorizationToken(
      store.storeClientId,
      store.storeClientSecret
    );

    const accessToken = await generateAccessToken(
      store.storeClientId,
      store.storeClientSecret
    );

    // 3. Fetch orders from Walmart Marketplace
    const res = await axios.get(
      'https://marketplace.walmartapis.com/v3/fulfillment/orders-fulfillments/status',
      {
        params: {
          limit: 50,
          offset: 0,
        },
        headers: {
          'WM_SEC.ACCESS_TOKEN': accessToken,
          'WM_QOS.CORRELATION_ID': correlationId,
          'WM_SVC.NAME': 'Walmart Marketplace',
          Authorization: authorizationToken,
        },
      }
    );
    const apiItems: Order[] = res.data.payload || [];

    return apiItems;
  } catch (err: any) {
    return null;
  }
};

export default syncOrdersFromAPI;
