import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';

import { hasPermission } from '../middlewares/checkPermission.js';
import { failedUploadsResult, getAllFailOrders, getAllStockAlerts } from './error.controller.js';

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

export default errorRouter;
