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
        const maxPages = 100; // Safety limit
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
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Start notification with timestamp
      const startTime = new Date();
      sendNotification(
        'info',
        `Product cron job started at ${startTime.toISOString()} - Processing all stores`
      );

      // Get all active stores with enhanced query
      const stores = await storeModel.find({ storeStatus: 'active' }).lean();
      console.log(`Found ${stores.length} active stores to process`);

      if (stores.length === 0) {
        sendNotification('info', 'No active stores found to process');
        return;
      }

      let grandTotalProcessed = 0;
      let grandTotalItems = 0;
      let processedStores = 0;
      let failedStores = 0;

      // Process each store with enhanced error handling
      for (const [index, store] of stores.entries()) {
        const storeStartTime = Date.now();
        let storeSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;

        console.log(
          `\nStarting store ${index + 1}/${stores.length}: ${store.storeId}`
        );

        while (retryCount < maxRetries && !storeSuccess) {
          try {
            let pageCount = 0;
            const maxPages = 50;
            let hasMore = true;
            let nextCursor: string | null = null;
            let storeTotalProcessed = 0;
            let storeTotalItems = 0;

            sendNotification(
              'info',
              `Processing products for store: ${store.storeName} (${store.storeId})`
            );

            // Pagination loop with enhanced logging
            while (hasMore && pageCount < maxPages) {
              pageCount++;
              const pageStartTime = Date.now();

              console.log(
                `Processing page ${pageCount} for store ${store.storeId}` +
                  (nextCursor
                    ? ` with cursor ${nextCursor.substring(0, 15)}...`
                    : '')
              );

              const params: any = { limit: 200 };
              if (nextCursor) params.nextCursor = nextCursor;

              const response = await axios
                .get(
                  `${apiUrl}/api/products/process-store-products/${store.storeId}`,
                  {
                    params,
                    timeout: 90000, // 90 seconds timeout
                  }
                )
                .catch((err) => {
                  console.error(
                    `API request failed for store ${store.storeId}:`,
                    {
                      status: err.response?.status,
                      data: err.response?.data,
                      message: err.message,
                    }
                  );
                  throw err;
                });

              
              const processingTime = Math.round(
                (Date.now() - pageStartTime) / 1000
              );
              const status = response.data.status;

              storeTotalProcessed +=
                status.newProducts + status.updatedProducts;
              storeTotalItems = status.totalItems || storeTotalItems;

              // Enhanced logging
              console.log(
                `Page ${pageCount} completed in ${processingTime}s - ` +
                  `New: ${status.newProducts}, Updated: ${status.updatedProducts}`
              );

              sendNotification(
                'success',
                `Completed page ${pageCount} for ${store.storeName}\n` +
                  `New: ${status.newProducts} | Updated: ${status.updatedProducts}\n` +
                  `Progress: ${storeTotalProcessed}/${storeTotalItems} items\n` +
                  `Time: ${processingTime}s` +
                  (response.data.meta?.hasMore ? '\nMore pages remaining' : '')
              );

              // Update pagination state
              hasMore = response.data.meta?.hasMore || false;
              nextCursor = response.data.meta?.nextCursor || null;

              // Dynamic delay based on processing time
              if (hasMore) {
                const delay = Math.min(
                  10000,
                  Math.max(3000, processingTime * 1000)
                );
                console.log(`Waiting ${delay}ms before next page...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }

            grandTotalProcessed += storeTotalProcessed;
            grandTotalItems += storeTotalItems;
            processedStores++;

            const storeProcessingTime = Math.round(
              (Date.now() - storeStartTime) / 60
            );
            console.log(
              `Store ${store.storeId} completed in ${storeProcessingTime}m - ` +
                `Processed ${storeTotalProcessed} items across ${pageCount} pages`
            );

            sendNotification(
              'success',
              `✅ Completed ${store.storeName}\n` +
                `Pages: ${pageCount} | Items: ${storeTotalProcessed}\n` +
                `Catalog Size: ${storeTotalItems}\n` +
                `Time: ${storeProcessingTime}m`
            );

            storeSuccess = true;
          } catch (error) {
            retryCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';

            console.error(
              `Attempt ${retryCount} failed for store ${store.storeId}:`,
              error
            );

            if (retryCount >= maxRetries) {
              failedStores++;
              sendNotification(
                'error',
                `❌ Failed processing ${store.storeName} after ${maxRetries} attempts\n` +
                  `Error: ${errorMessage}`
              );
            } else {
              const retryDelay = 10000 * retryCount;
              console.log(`Retrying in ${retryDelay / 1000}s...`);
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }

        // Dynamic delay between stores based on index
        if (index < stores.length - 1) {
          const interStoreDelay = 15000 + Math.random() * 5000; // 15-20s
          console.log(
            `Waiting ${Math.round(interStoreDelay / 1000)}s before next store...`
          );
          await new Promise((resolve) => setTimeout(resolve, interStoreDelay));
        }
      }

      // Final summary
      const totalTime = Math.round((Date.now() - startTime.getTime()) / 60000);
      const successRate = Math.round((processedStores / stores.length) * 100);

      console.log(
        `\nJob completed in ${totalTime}m\n` +
          `Stores: ${processedStores} succeeded, ${failedStores} failed\n` +
          `Items: ${grandTotalProcessed} processed from ${grandTotalItems} total`
      );

      sendNotification(
        'success',
        `🏁 Product sync completed\n` +
          `⏱️ Time: ${totalTime} minutes\n` +
          `🏪 Stores: ${processedStores}/${stores.length} (${successRate}%)\n` +
          `🛒 Items: ${grandTotalProcessed} processed\n` +
          `📦 Catalog: ${grandTotalItems} total items`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('CRITICAL JOB FAILURE:', error);
      sendNotification(
        'error',
        `‼️ Product cron job failed catastrophically\n` +
          `Error: ${errorMessage}`
      );
    }
  });
};

export { OrderCornJob, ProductCornJob };
