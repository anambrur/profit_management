import { Router } from 'express';
import { getAllOrders } from './order.controller.js';


const orderRouter = Router();

orderRouter.route('/get-all-orders/:id').get(getAllOrders);

export default orderRouter;
