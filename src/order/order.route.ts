import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getAllOrders, getOrders } from './order.controller.js';
import { hasPermission } from '../middlewares/checkPermission';

const orderRouter = Router();

orderRouter.route('/get-all-orders').get(getAllOrders);

//forntend route
orderRouter.get(
  '/get-orders',
  authenticateUser,
  hasPermission('order:view'),
  getOrders
);

export default orderRouter;
