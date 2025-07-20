import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import {
  getAllOrders,
  processStoreOrders,
  getOrders,
} from './order.controller.js';
import { hasPermission } from '../middlewares/checkPermission';

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
