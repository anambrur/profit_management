import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import createHttpError from 'http-errors';
import cloudinary from '../config/cloudinary';
import userModel from './user.model';

export const createUser = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, username, phone, address, password, role, status } =
      req.body;

    if (!name || !email || !username || !phone || !address || !password) {
      return next(createHttpError(400, 'All fields are required'));
    }

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
    });

    res
      .status(201)
      .json({ message: 'User created successfully', newUser, success: true });
  }
);
