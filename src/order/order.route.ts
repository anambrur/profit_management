import { Router } from 'express';
import { getAllOrders } from './order.controller';

const orderRouter = Router();

orderRouter.route('/get-all-orders').get(getAllOrders);

export default orderRouter;
