import { Router } from 'express';
import {
  getAllProducts,
  updateProduct,
  updateSingleProductHistory,
} from './product.controller';

const productRouter = Router();

productRouter.route('/get-all-products/:id').get(getAllProducts);
productRouter.route('/update-product/:id').put(updateProduct);
productRouter
  .route('/update-product-history/:id')
  .put(updateSingleProductHistory);

export default productRouter;
