import { Router } from 'express';

const orderRouter = Router();

orderRouter.route('/get-all-order').get();

export default orderRouter;
