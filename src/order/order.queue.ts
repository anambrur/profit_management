/* eslint-disable @typescript-eslint/no-explicit-any */
// order.queue.ts
import { Queue, Worker } from 'bullmq';
import { sendNotification } from '../service/notification.service';
import axios from 'axios';
import cron from 'node-cron';
import storeModel from '../store/store.model';

const apiUrl = process.env.API_BASE_URL;


const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const orderQueue = new Queue('order-processing', { connection });

// Worker to process store orders
const orderWorker = new Worker(
  'order-processing',
  async (job: any) => {
    const { storeId } = job.data;

    try {
      const response = await axios.get(
        `${apiUrl}/api/orders/process-store-orders/${storeId}`,
        { timeout: 300000 }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to process store'
      );
    }
  },
  { connection }
);

orderWorker.on('completed', (job: any, result: any) => {
  const storeId = job.data.storeId;
  const status = result.data.status || {};

  sendNotification(
    'success',
    `Completed processing for store ${storeId}\n` +
      `Orders: ${status.created || 0} created, ` +
      `${status.skipped || 0} skipped, ` +
      `${status.failed || 0} failed`
  );
});

orderWorker.on('failed', (job: any, err: any) => {
  sendNotification(
    'error',
    `Failed processing store ${job?.data?.storeId || 'unknown'}: ${err.message}`
  );
});

// Revised cron job to enqueue store processing
const OrderCornJob = () => {
  cron.schedule('*/47 * * * *', async () => {
    try {
      sendNotification(
        'info',
        'Order cron job started - Enqueuing store processing'
      );

      const stores = await storeModel.find({ storeStatus: 'active' });

      if (stores.length === 0) {
        sendNotification('info', 'No active stores found to process');
        return;
      }

      // Add each store to the queue with a delay between them
      const delayBetweenStores = 60000; // 1 minute between stores

      await Promise.all(
        stores.map((store, index) =>
          orderQueue.add(
            `store-${store.storeId}`,
            { storeId: store.storeId },
            {
              delay: index * delayBetweenStores,
              attempts: 3,
              backoff: { type: 'exponential', delay: 10000 },
            }
          )
        )
      );

      sendNotification(
        'success',
        `Enqueued ${stores.length} stores for processing`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendNotification(
        'error',
        `Failed to enqueue store processing: ${errorMessage}`
      );
    }
  });
};

export default OrderCornJob;
