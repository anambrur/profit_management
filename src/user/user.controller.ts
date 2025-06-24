import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import createHttpError from 'http-errors';
import jwt from 'jsonwebtoken';
import cloudinary from '../config/cloudinary.js';
import envConfig from '../config/envConfig.js';
import uploadLocalFileToCloudinary from '../service/fileUpload.service.js';
import userModel from './user.model.js';

//  ✅ Create User
export const createUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, username, phone, address, password, role, status } =
      req.body;

    if (!name || !email || !username || !phone || !password) {
      return next(createHttpError(400, 'All fields are required'));
    }
    try {
      const existingUser = await userModel.findOne({ email });
      if (existingUser) {
        return next(createHttpError(400, 'Email already exists'));
      }

      const existingUsername = await userModel.findOne({ username });
      if (existingUsername) {
        return next(createHttpError(400, 'Username already exists'));
      }

      // ✅ Handle Image Upload
      let imageUrl = '';
      let profileImagePublicId = '';
      if (req.file) {
        const result = await uploadLocalFileToCloudinary(
          req.file.path,
          'users_profile_images'
        );
        await fs.promises.unlink(req.file.path);
        imageUrl = (result as { secure_url: string }).secure_url;
        profileImagePublicId = (result as { public_id: string }).public_id;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await userModel.create({
        name,
        email,
        username,
        phone,
        address,
        password: hashedPassword,
        role,
        status,
        profileImage: imageUrl,
        profileImagePublicId: profileImagePublicId,
      });

      res
        .status(201)
        .json({ message: 'User created successfully', newUser, success: true });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Login User
export const loginUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return next(createHttpError(400, 'All fields are required'));
      }

      const user = await userModel.findOne({ email });
      if (!user) {
        return next(createHttpError(404, 'User not found'));
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return next(createHttpError(401, 'Invalid password'));
      }

      // ✅ Update lastLogin
      user.lastLogin = new Date();
      await user.save();

      // ✅ Create JWT token
      const token = jwt.sign({ id: user._id }, envConfig.jwtSecret as string, {
        expiresIn: '1d',
      });

      res.cookie('token', token, {
        httpOnly: false,
        secure: true, // only works on HTTPS
        sameSite: 'none', // allow cross-origin if needed
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      });
      // ✅ Send token in HTTP-Only Cookie
      res.status(200).json({
        message: 'Login successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          lastLogin: user.lastLogin,
          profileImage: user.profileImage,
        },
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Logout User
export const logoutUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    res.clearCookie('token', {
      httpOnly: false,
      secure: true, // same as cookie set
      sameSite: 'none', // same as cookie set
      path: '/', // default path
    });
    res.status(200).json({ message: 'Logout successful', success: true });
  }
);
export const updateUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userModel.findById(req.params.id);
      if (!user) {
        return next(createHttpError(404, 'User not found'));
      }

      const {
        name,
        email,
        username,
        phone,
        address,
        role, // coming from body
        status, // coming from body
      } = req.body;

      // ✅ Handle file upload (optional)
      if (req.file) {
        if (user.profileImagePublicId) {
          await cloudinary.uploader.destroy(user.profileImagePublicId);
        }

        const result = await uploadLocalFileToCloudinary(
          req.file.path,
          'users_profile_images'
        );

        await fs.promises.unlink(req.file.path);

        user.profileImage = (result as { secure_url: string }).secure_url;
        user.profileImagePublicId = (result as { public_id: string }).public_id;
      }

      // ✅ Update basic fields
      user.name = name;
      user.email = email;
      user.username = username;
      user.phone = phone;
      user.address = address;

      // ✅ Check if current user is admin before allowing role/status change
      const currentUser = req.user?.id; // Assuming you have authentication middleware
      const getUser = await userModel.findById(currentUser);
      if (getUser?.role === 'admin') {
        user.role = role || user.role;
        user.status = status || user.status;
      }

      const updatedUser = await user.save();

      res.status(200).json({
        message: 'User updated successfully',
        updatedUser,
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
);
// ✅ Delete User Admin Only
export const deleteUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userModel.findById(req.params.id);
      if (!user) {
        return next(createHttpError(404, 'User not found'));
      }

      if (user.profileImagePublicId) {
        await cloudinary.uploader.destroy(user.profileImagePublicId);
      }
      await user.deleteOne();
      res
        .status(200)
        .json({ message: 'User deleted successfully', success: true });
    } catch (error) {
      next(error);
    }
  }
);
// ✅ Get All User Admin Only
export const getAllUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await userModel.find();
      res.status(200).json({ users, success: true });
    } catch (error) {
      next(error);
    }
  }
);
// ✅ Get Single User
export const getUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userModel.findById(req.params.id).select('-password');
      if (!user) {
        return next(createHttpError(404, 'User not found'));
      }
      res.status(200).json({ user, success: true });
    } catch (error) {
      next(error);
    }
  }
);

export const changePassword = async (user: any, newPassword: string) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  user.password = hashedPassword;
  await user.save();
};
