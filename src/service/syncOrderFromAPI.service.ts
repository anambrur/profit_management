/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import generateAccessToken from '../utils/generateAccessToken.js';



const syncOrdersFromAPI = async (
  storeId?: string,
  storeClientId?: string,
  storeClientSecret?: string
) => {
  try {
    const correlationId = uuid();
    const accessToken = await generateAccessToken(
      storeClientId as string,
      storeClientSecret as string
    );
    if (!accessToken) throw new Error('Failed to generate access token');

    const shipNodeTypes = ['SellerFulfilled', 'WFSFulfilled', '3PLFulfilled'];

    // Process all shipNodeTypes in parallel
    const orderPromises = shipNodeTypes.map(async (shipNodeType) => {
      try {
        const response = await axios.get(
          'https://marketplace.walmartapis.com/v3/orders',
          {
            params: {
              createdStartDate: '2023-01-01',
              limit: 200,
              shipNodeType,
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
            timeout: 120000,
          }
        );

        console.log(
          `API Response Status: ${response.status} - ${shipNodeType} orders for store ${storeId}`
        );

        return (
          response.data?.list?.elements?.order?.map((order: any) => ({
            ...order,
            storeId,
            shipNodeType,
          })) || []
        );
      } catch (error: any) {
        console.error(
          `Failed to fetch ${shipNodeType} orders for store ${storeId}:`,
          error.response?.data || error.message
        );
        return [];
      }
    });

    const results = await Promise.all(orderPromises);
    return results.flat();
  } catch (err: any) {
    console.error(
      `Error processing store ${storeId}:`,
      err.response?.data || err.message
    );
    throw err;
  }
};

export default syncOrdersFromAPI;
