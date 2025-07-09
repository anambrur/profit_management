import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getAllOrders, getOrders } from './order.controller.js';

const orderRouter = Router();

orderRouter.route('/get-all-orders').get(getAllOrders);

//@ts-ignore
orderRouter.route('/get-orders').get(getOrders);

export default orderRouter;
