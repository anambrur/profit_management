import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import jwt from 'jsonwebtoken';
import { IUser } from '../types/role-permission.js'; // Import your IUser interface
import userModel from '../user/user.model.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUser; // Use your existing IUser interface
    }
  }
}

interface JwtPayload {
  id: string;
  roles?: string[];
  iat: number;
  exp: number;
}

export const authenticateUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token =
        req.cookies?.token ||
        req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return next(createHttpError(401, 'Unauthorized - No token provided'));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JwtPayload;

      const user = await userModel
        .findById(decoded.id)
        .select('-password -refreshToken');

      if (!user) {
        return next(createHttpError(401, 'Unauthorized - User not found'));
      }

      // Make sure to attach the full Mongoose model with methods
      req.user = user;

      next();
    } catch (error) {
      next(createHttpError(401, 'Unauthorized - Invalid token'));
    }
  }
);

export default authenticateUser;
