import axios from 'axios';
import cron from 'node-cron';
import { sendNotification } from './notification.service.js';
import storeModel from '../store/store.model.js';

const apiUrl = process.env.API_BASE_URL;

// Revised cron job to process all stores
const OrderCornJob = () => {
  cron.schedule('*/23 * * * *', async () => {
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
        try {
          sendNotification(
            'info',
            `Starting order processing for store: ${store.storeId}`
          );

          const startTime = Date.now();
          const response = await axios.get(
            `${apiUrl}/api/orders/process-store-orders/${store.storeId}`,
            { timeout: 120000 } // 2 minute timeout per store
          );

          const processingTime = Math.round((Date.now() - startTime) / 1000);

          sendNotification(
            'success',
            `Completed processing for store ${store.storeId}\n` +
              `Status: ${response.data.message}\n` +
              `Orders: ${response.data.status?.created || 0} created, ` +
              `${response.data.status?.skipped || 0} skipped, ` +
              `${response.data.status?.failed || 0} failed\n` +
              `Time: ${processingTime} seconds`
          );

          // Add delay between stores if needed (optional)
          if (stores.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          sendNotification(
            'error',
            `Failed processing store ${store.storeId}: ${errorMessage}`
          );
          // Continue to next store even if one fails
          continue;
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
  cron.schedule('*/27 * * * *', async () => {
    try {
      sendNotification('info', 'Product cron job started');
      const response = await axios.get(
        `${apiUrl}/api/products/get-all-products`
      );
      sendNotification(
        'success',
        `Product cron job completed: ${response.data.message}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendNotification('error', `Product cron job failed: ${errorMessage}`);
    }
  });
};

export { OrderCornJob, ProductCornJob };
