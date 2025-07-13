import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getAllOrders, getOrders } from './order.controller.js';

const orderRouter = Router();

orderRouter.route('/get-all-orders').get(getAllOrders);

//forntend route
orderRouter.get('/get-orders', authenticateUser, getOrders);

export default orderRouter;
