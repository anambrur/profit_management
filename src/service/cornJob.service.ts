/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import cron from 'node-cron';
import { sendNotification } from './notification.service.js';
import storeModel from '../store/store.model.js';

const apiUrl = process.env.API_BASE_URL;

// Revised cron job to process all stores
const OrderCornJob = () => {
  cron.schedule('*/15 * * * *', async () => {
    try {
      sendNotification(
        'info',
        'Order cron job started - Processing all stores'
      );

      // Get all active stores
      const stores = await storeModel.find({ storeStatus: 'active' });

      if (stores.length === 0) {
        sendNotification('info', 'No active stores found to process');
        return;
      }

      // Process each store sequentially
      for (const store of stores) {
        let pageCount = 0;
        const maxPages = 10; // Safety limit
        let hasMorePages = true;
        let nextCursors: Record<string, string | null> = {};

        try {
          while (hasMorePages && pageCount < maxPages) {
            pageCount++;
            const startTime = Date.now();

            // Prepare query params with encoded cursors
            const params: any = {};
            Object.entries(nextCursors).forEach(([shipNodeType, cursor]) => {
              if (cursor) {
                // params[`${shipNodeType}_cursor`] = encodeURIComponent(cursor);
                params[`${shipNodeType}_cursor`] = cursor;
              }
            });

            sendNotification(
              'info',
              `Processing page ${pageCount} for store ${store.storeId}`
            );

            const response = await axios.get(
              `${apiUrl}/api/orders/process-store-orders/${store.storeId}`,
              {
                params,
                timeout: 120000,
              }
            );

            const processingTime = Math.round((Date.now() - startTime) / 1000);

            sendNotification(
              'success',
              `Completed page ${pageCount} for store ${store.storeId}\n` +
                `Status: ${response.data.message}\n` +
                `Orders: ${response.data.status?.created || 0} created, ` +
                `${response.data.status?.skipped || 0} skipped, ` +
                `${response.data.status?.failed || 0} failed\n` +
                `Time: ${processingTime} seconds`
            );

            // Update next cursors for next iteration
            hasMorePages = false;
            response.data.meta.forEach((meta: any) => {
              if (meta.nextCursor) {
                nextCursors[meta.shipNodeType] = meta.nextCursor;
                hasMorePages = true;
              } else {
                nextCursors[meta.shipNodeType] = null;
              }
            });

            // Add delay between pages if needed
            if (hasMorePages) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
          }

          sendNotification(
            'success',
            `Completed all pages for store ${store.storeId} (processed ${pageCount} pages)`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          sendNotification(
            'error',
            `Failed processing store ${store.storeId}: ${errorMessage}`
          );
          continue;
        }

        // Add delay between stores if needed
        if (stores.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      sendNotification('success', 'Completed order processing for all stores');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendNotification('error', `Order cron job failed: ${errorMessage}`);
    }
  });
};



const ProductCornJob = () => {
  cron.schedule('*/3 * * * *', async () => {
    try {
      sendNotification(
        'info',
        'Product cron job started - Processing all stores'
      );

      // Get all active stores
      const stores = await storeModel.find({ storeStatus: 'active' });

      if (stores.length === 0) {
        sendNotification('info', 'No active stores found to process');
        return;
      }

      let grandTotalProcessed = 0;
      let grandTotalItems = 0;

      // Process each store sequentially
      for (const store of stores) {
        let pageCount = 0;
        const maxPages = 20; // Safety limit
        let hasMore = true;
        let nextCursor: string | null = null;
        let storeTotalProcessed = 0;
        let storeTotalItems = 0;

        try {
          sendNotification(
            'info',
            `Starting product processing for store: ${store.storeId}`
          );

          while (hasMore && pageCount < maxPages) {
            pageCount++;
            const startTime = Date.now();

            const params: any = {};
            if (nextCursor) {
              params.nextCursor = nextCursor;
            }

            const response = await axios.get(
              `${apiUrl}/api/products/process-store-products/${store.storeId}`,
              { params, timeout: 120000 }
            );


            const processingTime = Math.round((Date.now() - startTime) / 1000);
            const status = response.data.status;

            storeTotalProcessed += status.newProducts + status.updatedProducts;
            storeTotalItems = status.totalItems || storeTotalItems;

            sendNotification(
              'success',
              `Completed page ${pageCount} for store ${store.storeId}\n` +
                `New: ${status.newProducts} | Updated: ${status.updatedProducts}\n` +
                `Store Total: ${storeTotalProcessed}/${storeTotalItems}\n` +
                `Time: ${processingTime} seconds` +
                (response.data.meta?.hasMore ? '\nMore pages remaining' : '')
            );

            // Update pagination state
            hasMore = response.data.meta?.hasMore || false;
            nextCursor = response.data.meta?.nextCursor || null;

            if (hasMore) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          }

          grandTotalProcessed += storeTotalProcessed;
          grandTotalItems += storeTotalItems;

          sendNotification(
            'success',
            `Completed all pages for store ${store.storeId}\n` +
              `Pages: ${pageCount} | Items: ${storeTotalProcessed}\n` +
              `Store Catalog: ${storeTotalItems}`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          sendNotification(
            'error',
            `Failed processing store ${store.storeId}: ${errorMessage}`
          );
          continue;
        }

        // Add delay between stores if needed
        if (stores.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      sendNotification(
        'success',
        `Completed product processing for all stores\n` +
          `Grand Total Processed: ${grandTotalProcessed}\n` +
          `Grand Total Catalog: ${grandTotalItems}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendNotification('error', `Product cron job failed: ${errorMessage}`);
    }
  });
};

export { OrderCornJob, ProductCornJob };
