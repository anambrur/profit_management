import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { hasPermission } from '../middlewares/checkPermission.js';
import { upload } from '../middlewares/multer.js';
import {
  createStore,
  deleteStore,
  getAllStore,
  getSingleStore,
  updateStore,
} from './store.controller.js';

const storeRouter = Router();

storeRouter.post(
  '/create-store',
  authenticateUser,
  hasPermission('store:create'),
  upload.single('storeImage'),
  createStore
);

storeRouter.get(
  '/get-store/:id',
  authenticateUser,
  getSingleStore,
  hasPermission('store:view')
);
storeRouter.put(
  '/store-update/:id',
  authenticateUser,
  updateStore,
  hasPermission('store:edit')
);
storeRouter.get(
  '/get-all-store',
  authenticateUser,
  getAllStore,
  hasPermission('store:view')
);
storeRouter.delete(
  '/store-delete/:id',
  authenticateUser,
  deleteStore,
  hasPermission('store:delete')
);

export default storeRouter;
