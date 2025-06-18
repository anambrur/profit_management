import axios from 'axios';
import corn from 'node-cron';

const apiUrl = process.env.API_BASE_URL;

const OrderCornJob = () => {
  corn.schedule('*/47 * * * *', async () => {
    try {
      console.log('Cron job is start');
      const response = await axios.get(`${apiUrl}/api/orders/get-all-orders`);
      console.log(response.data.message);
    } catch (error) {
      console.error(error);
    } finally {
      console.log('Cron job is complete Order');
    }
  });
};

const ProductCornJob = () => {
  corn.schedule('*/27 * * * *', async () => {
    try {
      console.log('Cron job is start');
      const response = await axios.get(
        `${apiUrl}/api/products/get-all-products`
      );
      console.log(response.data.message);
    } catch (error) {
      console.error(error);
    } finally {
      console.log('Cron job is complete Product');
    }
  });
};

export { OrderCornJob, ProductCornJob };
