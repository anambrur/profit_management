import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getAllProducts, getMyDbAllProduct } from './product.controller.js';

const productRouter = Router();

productRouter.route('/get-all-products').get(getAllProducts);

productRouter.route('/get-products').get(authenticateUser, getMyDbAllProduct);

export default productRouter;
