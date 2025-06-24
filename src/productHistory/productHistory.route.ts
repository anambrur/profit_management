import { Router } from 'express';
import {
  createProductHistory,
  getAllProductHistory,
  getProductHistoryList,
  updateSingleField,
} from './productHistory.controller.js';

const productHistoryRouter = Router();

productHistoryRouter
  .route('/get-all-product-history')
  .get(getAllProductHistory);

productHistoryRouter.route('/:id/update').patch((req, res, next) => {
  Promise.resolve(updateSingleField(req, res, next)).catch(next);
});

productHistoryRouter
  .route('/create-product-history/:id')
  .post((req, res, next) => {
    Promise.resolve(createProductHistory(req, res, next)).catch(next);
  });

productHistoryRouter
  .route('/get-product-history-list/:id')
  .get(getProductHistoryList);

export default productHistoryRouter;
