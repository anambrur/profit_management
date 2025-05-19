import { Router } from 'express';
import { getAllProducts } from './product.controller';

const productRouter = Router();

productRouter.route('/get-all-products/:id').get(getAllProducts);

export default productRouter;
