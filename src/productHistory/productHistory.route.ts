import { Router } from 'express';
import { csvUpload } from '../middlewares/multer.js';
import {
  bulkUploadProductHistory,
  createProductHistory,
  deleteProduct,
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

productHistoryRouter
  .route('/delete-product-history/:id')
  .delete((req, res, next) => {
    Promise.resolve(deleteProduct(req, res, next)).catch(next);
  });

productHistoryRouter.post(
  '/upload-product-history',
  csvUpload.single('file'),
  (req, res, next) => {
    Promise.resolve(bulkUploadProductHistory(req, res, next)).catch(next);
  }
);
export default productHistoryRouter;
