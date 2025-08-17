/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import createHttpError from 'http-errors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import cloudinary from '../config/cloudinary.js';
import envConfig from '../config/envConfig.js';
import roleModel from '../role/role.model.js';
import uploadLocalFileToCloudinary from '../service/fileUpload.service.js';
import storeModel from '../store/store.model.js';
import { IUser } from '../types/role-permission.js';
import { StoreAccessRequest } from '../types/store-access.js';
import userModel from './user.model.js';

// Helper function for role/permission checks
export const checkAdminOrSelf = async (
  req: Request,
  userId: string
): Promise<boolean> => {
  if (!req.user) return false;

  const user = req.user as IUser;

  // Check if user is admin or the same user being modified
  return user.hasRole('admin') || user.id.toString() === userId;
};

// ✅ Create User (Admin only)
export const createUser = expressAsyncHandler(
  async (req: StoreAccessRequest | any, res: Response, next: NextFunction) => {
    const {
      name,
      email,
      username,
      phone,
      address,
      password,
      status,
      allowedStores,
    } = req.body;

    if (!name || !email || !username || !phone || !password || !allowedStores) {
      return next(createHttpError(400, 'All fields are required'));
    }

    try {
      // Verify store IDs exist if provided
      if (allowedStores && allowedStores.length > 0) {
        const existingStores = await storeModel.countDocuments({
          _id: { $in: allowedStores },
        });
        if (existingStores !== allowedStores.length) {
          return next(
            createHttpError(400, 'One or more store IDs are invalid')
          );
        }
      }
      // Check permissions
      if (!(await checkAdminOrSelf(req, ''))) {
        return next(createHttpError(403, 'Forbidden - Admin access required'));
      }

      // Check existing users
      const [existingEmail, existingUsername] = await Promise.all([
        userModel.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } }),
        userModel.findOne({ username }),
      ]);

      if (existingEmail)
        return next(createHttpError(400, 'Email already exists'));
      if (existingUsername)
        return next(createHttpError(400, 'Username already exists'));

      // Handle image upload
      let imageData = { url: '', publicId: '' };
      if (req.file) {
        const result = await uploadLocalFileToCloudinary(
          req.file.path,
          'users_profile_images'
        );
        await fs.promises.unlink(req.file.path);
        imageData = {
          url: (result as { secure_url: string }).secure_url,
          publicId: (result as { public_id: string }).public_id,
        };
      }

      const roleId = await roleModel.findOne({ name: req.body.roles });
      if (!roleId) {
        return next(createHttpError(404, 'Role not found'));
      }

      // Create user
      const newUser = await userModel.create({
        name,
        email,
        username,
        phone,
        address,
        password: await bcrypt.hash(password, 12),
        status: status || 'active',
        profileImage: imageData.url,
        profileImagePublicId: imageData.publicId,
        roles: roleId._id,
        allowedStores: allowedStores,
      });

      // Omit sensitive data in response
      const userResponse = newUser.toObject();
      // @ts-ignore
      delete userResponse.password;
      delete userResponse.profileImagePublicId;

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: userResponse,
      });
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
      return next(createHttpError(400, 'Email and password are required'));
    }

    try {
      const user = await userModel
        .findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } })
        .select('+password +status +roles')
        .populate({
          path: 'roles',
          populate: {
            path: 'permissions',
            model: 'Permission',
            select: '_id name',
          },
        })
        .populate('allowedStores', '_id storeId storeName storeEmail');

      if (!user) {
        return next(createHttpError(401, 'User not found'));
      }

      if (user.status !== 'active') {
        return next(createHttpError(403, 'Account is not active'));
      }
      const isComparePassword = await bcrypt.compare(password, user.password);
      if (!isComparePassword) {
        return next(createHttpError(401, 'Invalid password'));
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      const token = jwt.sign(
        {
          id: user._id,
          roles: user.roles.map((role: any) => role.name),
        },
        envConfig.jwtSecret as string,
        { expiresIn: '1d', algorithm: 'HS256' }
      );

      const domain =
        process.env.NODE_ENV === 'production'
          ? process.env.cookieDomain
          : 'localhost';

      // Secure cookie settings
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000,
        domain: domain,
        path: '/',
      });

      // Response data
      const userData = {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        profileImage: user.profileImage,
        lastLogin: user.lastLogin,
        allowedStores: user.allowedStores,
      };

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: userData,
        token: token,
      });
    } catch (error) {
      next(createHttpError(500, 'Login failed. Please try again later'));
    }
  }
);

// ✅ Logout User
export const logoutUser = expressAsyncHandler(
  async (req: Request, res: Response) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: envConfig.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/',
    });
    res.status(200).json({ success: true, message: 'Logout successful' });
  }
);

// ✅ Update User (now with store management)
export const updateUser = expressAsyncHandler(
  async (req: StoreAccessRequest | any, res: Response, next: NextFunction) => {
    try {
      const user = await userModel.findById(req.params.id);
      if (!user) return next(createHttpError(404, 'User not found'));

      // Check permissions
      const populatedUser = await userModel
        .findById(req.user?._id)
        .populate('roles');
      const isAdmin = await populatedUser?.hasRole('admin');

      if (!isAdmin) {
        return next(createHttpError(403, 'Forbidden - Admin access required'));
      }

      // Handle file upload
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

      // Update basic fields
      const {
        name,
        email,
        username,
        phone,
        address,
        status,
        allowedStores,
        newPassword,
      } = req.body;
      
      user.name = name || user.name;
      user.email = email || user.email;
      user.username = username || user.username;
      user.phone = phone || user.phone;
      user.address = address || user.address;

      if (newPassword) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
      }

      // Only admin can update status, roles, and stores
      if (req.user?.hasRole('admin')) {
        user.status = status || user.status;

        // Handle roles update
        if (req.body.roles) {
          await user.assignRole(req.body.roles);
        }

        // Handle store assignments if provided
        if (allowedStores !== undefined) {
          // Verify store IDs exist
          if (allowedStores.length > 0) {
            const existingStores = await storeModel.countDocuments({
              _id: { $in: allowedStores },
            });
            if (existingStores !== allowedStores.length) {
              return next(
                createHttpError(400, 'One or more store IDs are invalid')
              );
            }
          }

          // Update allowed stores
          user.allowedStores = allowedStores.map(
            (id: string) => new mongoose.Types.ObjectId(id)
          );
        }
      }

      const updatedUser = await user.save();
      const userResponse = updatedUser.toObject();
      // @ts-ignore
      delete userResponse.password;
      delete userResponse.profileImagePublicId;

      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        user: userResponse,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Delete User (Admin only)
export const deleteUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore
      if (!req.user?.hasRole('admin')) {
        return next(createHttpError(403, 'Forbidden - Admin access required'));
      }

      const user = await userModel.findById(req.params.id);
      if (!user) return next(createHttpError(404, 'User not found'));

      if (user.profileImagePublicId) {
        await cloudinary.uploader.destroy(user.profileImagePublicId);
      }

      await user.deleteOne();
      res
        .status(200)
        .json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get All Users (Admin only)
export const getAllUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore
      if (!req.user?.hasRole('admin')) {
        return next(createHttpError(403, 'Forbidden - Admin access required'));
      }

      const users = await userModel
        .find()
        .select('-password -profileImagePublicId')
        .populate('roles');
      res.status(200).json({ success: true, users });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Get Single User
export const getUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userModel.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
        { $project: { password: 0, profileImagePublicId: 0 } },
        {
          $lookup: {
            from: 'roles',
            localField: 'roles',
            foreignField: '_id',
            as: 'roles',
            pipeline: [
              {
                $lookup: {
                  from: 'permissions',
                  localField: 'permissions',
                  foreignField: '_id',
                  as: 'permissions',
                  pipeline: [
                    { $project: { name: 1 } }, // Include both name and _id (implicit)
                  ],
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'stores',
            localField: 'allowedStores',
            foreignField: '_id',
            as: 'allowedStores',
          },
        },
        { $limit: 1 },
      ]);

      if (!user.length) return next(createHttpError(404, 'User not found'));

      res.status(200).json({ success: true, user: user[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ✅ Change Password
export const changePassword = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { newPassword } = req.body;
    if (!newPassword) {
      return next(
        createHttpError(400, 'Both current and new password are required')
      );
    }

    try {
      if (req.params.id) {
        const user = await userModel
          .findById(req.params.id)
          .select('+password');
        if (!user) return next(createHttpError(404, 'User not found'));

        user.password = await bcrypt.hash(newPassword, 12);
        await user.save();
      }

      res
        .status(200)
        .json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);
