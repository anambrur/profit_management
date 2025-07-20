import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getAllProducts, getMyDbAllProduct } from './product.controller.js';

import { hasPermission } from '../middlewares/checkPermission.js';

const productRouter = Router();

productRouter.route('/get-all-products').get(getAllProducts);

//forntend route
productRouter.get(
  '/get-products',
  authenticateUser,
  hasPermission('product:view'),
  getMyDbAllProduct
);

export default productRouter;
