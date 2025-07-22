import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { hasAnyPermission, hasRole } from '../middlewares/checkPermission.js';
import { upload } from '../middlewares/multer.js';
import {
  changePassword,
  createUser,
  deleteUser,
  getAllUser,
  getUser,
  loginUser,
  logoutUser,
  updateUser,
} from './user.controller.js';

const userRouter = Router();

// ✅ Create User (Admin only)
userRouter.post(
  '/register',
  authenticateUser,
  hasRole('admin'), // Only admin can register users
  upload.single('profileImage'),
  createUser
);

// ✅ Login User (Public)
userRouter.post('/login', loginUser);

// ✅ Logout User (Authenticated users only)
userRouter.post('/logout', authenticateUser, logoutUser);

// ✅ Get All Users (Admin or users with view permission)
userRouter.get(
  '/all-user',
  authenticateUser,
  hasAnyPermission(['user:view', 'user:admin']),
  getAllUser
);

// ✅ Delete User (Admin only)
userRouter.delete(
  '/delete-user/:id',
  authenticateUser,
  hasRole('admin'), // Only admin can delete users
  deleteUser
);

// ✅ Update User (Own profile or admin)
userRouter.put(
  '/update-user/:id',
  authenticateUser,
  upload.single('profileImage'),
  updateUser
);

// ✅ Get user by ID (Admin or own profile)
userRouter.get('/get-user/:id', authenticateUser, getUser);
userRouter.patch('/update-password/:id', authenticateUser, changePassword);

export default userRouter;
