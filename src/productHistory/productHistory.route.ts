import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { csvUpload } from '../middlewares/multer.js';
import {
  bulkUploadProductHistory,
  createProductHistory,
  deleteProduct,
  getAllProductHistory,
  getProductHistoryList,
  updateSingleField,
} from './productHistory.controller.js';
import { hasPermission } from '../middlewares/checkPermission';

const productHistoryRouter = Router();

productHistoryRouter.get(
  '/get-all-product-history',
  authenticateUser,
  hasPermission('product-history:view'),
  getAllProductHistory
);

productHistoryRouter.post(
  '/create-product-history/:id',
  authenticateUser,
  hasPermission('product-history:create'),
  (req, res, next) => {
    Promise.resolve(createProductHistory(req, res, next)).catch(next);
  }
);

productHistoryRouter.get(
  '/get-product-history-list/:id',
  authenticateUser,
  hasPermission('product-history:view'),
  getProductHistoryList
);

productHistoryRouter.patch(
  '/:id/update',
  authenticateUser,
  hasPermission('product-history:edit'),
  (req, res, next) => {
    Promise.resolve(updateSingleField(req, res, next)).catch(next);
  }
);

productHistoryRouter.delete(
  '/delete-product-history/:id',
  authenticateUser,
  hasPermission('product-history:delete'),
  (req, res, next) => {
    Promise.resolve(deleteProduct(req, res, next)).catch(next);
  }
);

productHistoryRouter.post(
  '/upload-product-history',
  csvUpload.single('file'),
  authenticateUser,
  hasPermission('product-history:create'),
  (req, res, next) => {
    Promise.resolve(bulkUploadProductHistory(req, res, next)).catch(next);
  }
);
export default productHistoryRouter;
