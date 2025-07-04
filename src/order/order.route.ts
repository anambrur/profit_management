import { Router } from 'express';
import { getAllOrders, getOrders } from './order.controller.js';

const orderRouter = Router();

orderRouter.route('/get-all-orders').get(getAllOrders);
orderRouter.route('/get-orders').get(getOrders);

export default orderRouter;
