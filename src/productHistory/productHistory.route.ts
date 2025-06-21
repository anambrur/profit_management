import { Router } from 'express';
import { getAllProductHistory } from './productHistory.controller';

const productHistoryRouter = Router();

productHistoryRouter
  .route('/get-all-product-history')
  .get(getAllProductHistory);

export default productHistoryRouter;
