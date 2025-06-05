import { Router } from 'express';
import {
  getAllProducts,
  updateProduct,
  addSingleProductHistory,
} from './product.controller';

const productRouter = Router();

productRouter.route('/get-all-products').get(getAllProducts);
productRouter.route('/update-product/:id').put(updateProduct);
productRouter
  .route('/add-single-product-history/:id')
  .put(addSingleProductHistory);

export default productRouter;
