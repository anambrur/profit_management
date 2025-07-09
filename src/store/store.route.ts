import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { upload } from '../middlewares/multer.js';
import {
  createStore,
  deleteStore,
  getAllStore,
  getSingleStore,
  updateStore,
} from './store.controller.js';

const storeRouter = Router();

storeRouter
  .route('/create-store')
  // @ts-ignore
  .post(upload.single('storeImage'), createStore);

// @ts-ignore
storeRouter.route('/get-store/:id').get(authenticateUser, getSingleStore);
// @ts-ignore
storeRouter.route('/store-update/:id').put(authenticateUser, updateStore);
// @ts-ignore
storeRouter.route('/get-all-store').get(authenticateUser, getAllStore);
// @ts-ignore
storeRouter.route('/store-delete/:id').delete(authenticateUser, deleteStore);

export default storeRouter;
