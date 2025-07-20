import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';

import { hasPermission } from '../middlewares/checkPermission.js';
import { getOrders, processStoreOrders } from './order.controller.js';

const orderRouter = Router();

// orderRouter.route('/get-all-orders').get(getAllOrders);

//queue based route
orderRouter.route('/process-store-orders/:storeId').get(processStoreOrders);

//forntend route
orderRouter.get(
  '/get-orders',
  authenticateUser,
  hasPermission('order:view'),
  getOrders
);

export default orderRouter;
