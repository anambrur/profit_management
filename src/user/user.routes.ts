import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import upload from '../middlewares/multer.js';
import protectAdmin from '../middlewares/protectAdmin.js';
import {
  createUser,
  deleteUser,
  getAllUser,
  getUser,
  loginUser,
  logoutUser,
  updateUser,
} from './user.controller.js';

const userRouter = Router();

// ✅ Create User
userRouter.route('/register').post(
  // // @ts-ignore,
  // authenticateUser,
  // protectAdmin,
  upload.single('profileImage'),
  createUser
);
// ✅ Login User
userRouter.route('/login').post(loginUser);
// ✅ Logout User
userRouter.route('/logout').post(logoutUser);
// ✅ Get All User
userRouter.route('/all-user').get(
  // @ts-ignore
  getAllUser
);
// ✅ Delete User
userRouter.route('/delete-user/:id').delete(
  // @ts-ignore
  authenticateUser,
  protectAdmin,
  deleteUser
);
// ✅ Update User
userRouter.route('/update-user/:id').put(
  // @ts-ignore
  // authenticateUser,
  upload.single('profileImage'),
  updateUser
);
// ✅ get user by id
userRouter.route('/get-user/:id').get(
  // // @ts-ignore
  // authenticateUser,
  getUser
);

export default userRouter;
