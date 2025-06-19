import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { Order } from '../types/types';
import generateAccessToken from '../utils/generateAccessToken';

const syncOrdersFromAPI = async (
  storeId?: string,
  storeClientId?: string,
  storeClientSecret?: string
) => {
  try {
    const correlationId = uuid();
    // console.log(`Starting sync for store ${storeId}`);

    // 1. Generate Access Token
    const accessToken = await generateAccessToken(
      storeClientId as string,
      storeClientSecret as string
    );
    if (!accessToken) {
      throw new Error('Failed to generate access token');
    }

    const allOrders: Order[] = [];
    const shipNodeTypes = ['SellerFulfilled', 'WFSFulfilled', '3PLFulfilled'];

    for (const shipNodeType of shipNodeTypes) {
      try {
        // console.log(`Fetching ${shipNodeType} orders for store ${storeId}`);

        const response = await axios.get(
          'https://marketplace.walmartapis.com/v3/orders',
          {
            params: {
              createdStartDate: '2023-01-01',
              limit: 100,
              shipNodeType: shipNodeType,
              replacementInfo: false,
              productInfo: true,
            },
            headers: {
              'WM_SEC.ACCESS_TOKEN': accessToken,
              'WM_QOS.CORRELATION_ID': correlationId,
              'WM_SVC.NAME': 'Walmart Marketplace',
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 second timeout
          }
        );

        console.log(`API Response Status: ${response.status}`);

        if (response.data?.list?.elements?.order) {
          response.data.list.elements.order.forEach((order: any) => {
            allOrders.push({
              ...order,
              storeId: storeId,
              shipNodeType: shipNodeType,
            });
          });
        }
      } catch (error: any) {
        console.error(
          `Failed to fetch ${shipNodeType} orders for store ${storeId}:`,
          error.response?.data || error.message
        );
        continue;
      }
    }

    return allOrders;
  } catch (err: any) {
    console.error(
      `Error processing store ${storeId}:`,
      err.response?.data || err.message
    );
    throw err;
  }
};

export default syncOrdersFromAPI;
