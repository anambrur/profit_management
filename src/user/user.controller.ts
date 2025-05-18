import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import jwt from 'jsonwebtoken';
import cloudinary from '../config/cloudinary';
import envConfig from '../config/envConfig';
import userModel from './user.model';

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
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: 'user_profile_images' }, (err, result) => {
              if (err) return reject(err);
              resolve(result);
            })
            .end(req.file?.buffer ?? Buffer.alloc(0));
        });
        imageUrl = result.secure_url;
        profileImagePublicId = result.public_id;
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

    if (!email || !password) {
      return next(createHttpError(400, 'All fields are required'));
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return next(createHttpError(400, 'User not found'));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return next(createHttpError(400, 'Invalid password'));
    }

    const token = jwt.sign({ id: user._id }, envConfig.jwtSecret as string, {
      expiresIn: '1d',
    });
    res
      .status(200)
      .cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      })
      .json({ message: 'Login successful', user, success: true, token });
  }
);
// ✅ Logout User
export const logoutUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    res
      .status(200)
      .clearCookie('token')
      .json({ message: 'Logout successful', success: true });
  }
);
//  ✅ Update User Profile
export const updateUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, username, phone, address } = req.body;

    if (!name || !email || !username || !phone) {
      return next(createHttpError(400, 'All fields are required'));
    }

    try {
      const user = await userModel.findById(req.params.id);
      if (!user) {
        return next(createHttpError(404, 'User not found'));
      }

      if (req.file) {
        if (user.profileImagePublicId) {
          await cloudinary.uploader.destroy(user.profileImagePublicId);
        }

        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                folder: 'user_profile_images',
              },
              (err, result) => {
                if (err) return reject(err);
                resolve(result);
              }
            )
            .end(req.file?.buffer ?? Buffer.alloc(0));
        });

        user.profileImage = result.secure_url;
        user.profileImagePublicId = result.public_id;
      }

      // ✅ Update fields
      user.name = name;
      user.email = email;
      user.username = username;
      user.phone = phone;
      user.address = address;

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
