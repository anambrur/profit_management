/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import generateAccessToken from '../utils/generateAccessToken.js';

interface SyncResult {
  orders: any[];
  meta: {
    totalCount: number;
    limit: number;
    nextCursor: string | null;
    shipNodeType: string;
  }[];
}

// const syncOrdersFromAPI = async (
//   storeId?: string,
//   storeClientId?: string,
//   storeClientSecret?: string,
//   cursors: Record<string, string> = {}
// ): Promise<SyncResult> => {
//   try {
//     const correlationId = uuid();
//     const accessToken = await generateAccessToken(
//       storeClientId as string,
//       storeClientSecret as string
//     );
//     if (!accessToken) throw new Error('Failed to generate access token');

//     const shipNodeTypes = ['SellerFulfilled', 'WFSFulfilled', '3PLFulfilled'];

//     // Process all shipNodeTypes in parallel
//     const orderPromises = shipNodeTypes.map(async (shipNodeType) => {
//       try {
//         const params: any = {
//           createdStartDate: '2023-01-01',
//           limit: 40,
//           shipNodeType,
//           replacementInfo: false,
//           productInfo: true,
//         };

//         // Extract just the cursor value from the cursor string if it exists
//         if (cursors[shipNodeType]) {
//           const cursorMatch = cursors[shipNodeType].match(/cursor=([^&]+)/);
//           if (cursorMatch && cursorMatch[1]) {
//             params.cursor = cursorMatch[1];
//           }
//         }

//         const response = await axios.get(
//           'https://marketplace.walmartapis.com/v3/orders',
//           {
//             params,
//             headers: {
//               'WM_SEC.ACCESS_TOKEN': accessToken,
//               'WM_QOS.CORRELATION_ID': correlationId,
//               'WM_SVC.NAME': 'Walmart Marketplace',
//               Accept: 'application/json',
//               'Content-Type': 'application/json',
//             },
//             timeout: 120000,
//           }
//         );

//         const data = response.data?.list || {};
//         const orders = data.elements?.order || [];
//         const meta = data.meta || {};

//         return {
//           orders: orders.map((order: any) => ({
//             ...order,
//             storeId,
//             shipNodeType,
//           })),
//           meta: {
//             ...meta,
//             shipNodeType,
//           },
//         };
//       } catch (error: any) {
//         console.error(
//           `Failed to fetch ${shipNodeType} orders for store ${storeId}:`,
//           error.response?.data || error.message
//         );
//         return {
//           orders: [],
//           meta: {
//             totalCount: 0,
//             limit: 0,
//             nextCursor: null,
//             shipNodeType,
//           },
//         };
//       }
//     });

//     const results = await Promise.all(orderPromises);

//     return {
//       orders: results.flatMap((r) => r.orders),
//       meta: results.map((r) => r.meta),
//     };
//   } catch (err: any) {
//     console.error(
//       `Error processing store ${storeId}:`,
//       err.response?.data || err.message
//     );
//     throw err;
//   }
// };

const syncOrdersFromAPI = async (
  storeId?: string,
  storeClientId?: string,
  storeClientSecret?: string,
  cursors: Record<string, string> = {}
): Promise<SyncResult> => {
  try {
    const correlationId = uuid();
    const accessToken = await generateAccessToken(
      storeClientId as string,
      storeClientSecret as string
    );
    if (!accessToken) throw new Error('Failed to generate access token');

    const shipNodeTypes = ['SellerFulfilled', 'WFSFulfilled', '3PLFulfilled'];

    // Process all shipNodeTypes in parallel with retries
    const orderPromises = shipNodeTypes.map(async (shipNodeType) => {
      let retryCount = 0;
      const maxRetries = 3;
      let lastError: any = null;

      while (retryCount < maxRetries) {
        try {
          const params: any = {
            createdStartDate: '2023-01-01',
            limit: 40,
            shipNodeType,
            replacementInfo: false,
            productInfo: true,
          };

          // Extract cursor if it exists
          if (cursors[shipNodeType]) {
            const cursorMatch = cursors[shipNodeType].match(/cursor=([^&]+)/);
            if (cursorMatch && cursorMatch[1]) {
              params.cursor = cursorMatch[1];
            }
          }

          const response = await axios.get(
            'https://marketplace.walmartapis.com/v3/orders',
            {
              params,
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

          const data = response.data?.list || {};
          const orders = data.elements?.order || [];
          const meta = data.meta || {};

          return {
            orders: orders.map((order: any) => ({
              ...order,
              storeId,
              shipNodeType,
            })),
            meta: {
              ...meta,
              shipNodeType,
            },
          };
        } catch (error: any) {
          lastError = error;
          retryCount++;

          // Log the error with more details
          console.error(
            `Attempt ${retryCount} failed for ${shipNodeType} orders (store ${storeId}):`,
            error.response?.status,
            error.response?.data || error.message,
            JSON.stringify(error.response?.data, null, 2) || error.message
          );

          if (retryCount < maxRetries) {
            // Exponential backoff
            const delay = Math.min(10000, 1000 * Math.pow(2, retryCount));
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // If we get here, all retries failed
      console.error(
        `All retries failed for ${shipNodeType} orders (store ${storeId}):`,
        lastError.response?.data || lastError.message
      );

      return {
        orders: [],
        meta: {
          totalCount: 0,
          limit: 0,
          nextCursor: null,
          shipNodeType,
        },
      };
    });

    const results = await Promise.all(orderPromises);

    return {
      orders: results.flatMap((r) => r.orders),
      meta: results.map((r) => r.meta),
    };
  } catch (err: any) {
    console.error(
      `Error processing store ${storeId}:`,
      err.response?.data || err.message
    );
    throw err;
  }
};

export default syncOrdersFromAPI;
