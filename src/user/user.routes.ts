import { Router } from 'express';
import { createUser } from './user.controller';
import upload from '../middlewares/multer';

const userRouter = Router();

userRouter.route('/register').post(upload.single('profileImage'),createUser);

export default userRouter;
