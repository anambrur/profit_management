import { Router } from 'express';
import {
  // addSingleProductHistory,
  getAllProducts,
  getMyDbAllProduct,
} from './product.controller.js';

const productRouter = Router();

productRouter.route('/get-all-products').get(getAllProducts);
// productRouter.route('/update-product/:id').put(updateProduct);
// productRouter
//   .route('/add-single-product-history/:id')
//   .put(addSingleProductHistory);

productRouter.route('/get-products').get(getMyDbAllProduct);

export default productRouter;
