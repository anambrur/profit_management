import axios from 'axios';
import corn from 'node-cron';
import { sendNotification } from './notification.service.js';

const apiUrl = process.env.API_BASE_URL;

const OrderCornJob = () => {
  corn.schedule('*/47 * * * *', async () => {
    try {
      sendNotification('info', 'Order cron job started');
      const response = await axios.get(`${apiUrl}/api/orders/get-all-orders`);
      sendNotification(
        'success',
        `Order cron job completed: ${response.data.message}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendNotification('error', `Order cron job failed: ${errorMessage}`);
    }
  });
};

const ProductCornJob = () => {
  corn.schedule('*/27 * * * *', async () => {
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
