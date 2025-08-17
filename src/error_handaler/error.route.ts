import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';

import { hasPermission } from '../middlewares/checkPermission.js';
import { processOrders, processProducts } from '../service/cornJob.service.js';
import {
  failedUploadsResult,
  getAllFailOrders,
  getAllStockAlerts,
} from './error.controller.js';

const errorRouter = Router();

//stock alerts
errorRouter.get(
  '/get-all-stock-alerts',
  authenticateUser,
  hasPermission('stock-alert-order:view'),
  getAllStockAlerts
);

//fail orders
errorRouter.get(
  '/get-all-fail-orders',
  authenticateUser,
  hasPermission('failed-order:view'),
  getAllFailOrders
);

//fail orders
errorRouter.get(
  '/get-all-fail-uploads-results',
  authenticateUser,
  hasPermission('failed-upload-result:view'),
  failedUploadsResult
);

errorRouter.post('/trigger/orders', async (req, res) => {
  try {
    const result = await processOrders();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process orders' });
  }
});

errorRouter.post('/trigger/products', async (req, res) => {
  try {
    const result = await processProducts();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process products' });
  }
});

export default errorRouter;
