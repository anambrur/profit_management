import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import fs from 'fs';
import createHttpError from 'http-errors';
import cloudinary from '../config/cloudinary';
import uploadLocalFileToCloudinary from '../service/fileUpload.service';
import storeModel from './store.model';

export const createStore = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { storeId, storeName, storeEmail, storeClientId, storeClientSecret } =
      req.body;
    if (
      !storeId ||
      !storeName ||
      !storeEmail ||
      !storeClientId ||
      !storeClientSecret
    ) {
      return next(createHttpError(400, 'All fields are required'));
    }
    try {
      let imageUrl = '';
      let profileImagePublicId = '';
      if (req.file) {
        const result = await uploadLocalFileToCloudinary(
          req.file.path,
          'store_image'
        );
        await fs.promises.unlink(req.file.path);
        imageUrl = (result as { secure_url: string }).secure_url;
        profileImagePublicId = (result as { public_id: string }).public_id;
      }

      // const encryptedStoreClientId = storeClientId;
      // const encryptedStoreClientSecret = storeClientSecret;

      const newStore = await storeModel.create({
        storeId,
        storeName,
        storeEmail,
        storeClientId,
        storeClientSecret,
        storeImage: imageUrl,
        storeImagePublicId: profileImagePublicId,
      });

      res.status(201).json({
        newStore,
        success: true,
        message: 'Store created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export const getAllStore = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await storeModel.find();
      res.status(200).json({ stores, success: true });
    } catch (error) {
      next(error);
    }
  }
);
export const updateStore = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await storeModel.findById(req.params.id);
      if (!store) {
        return next(createHttpError(404, 'Store not found'));
      }

      const updatedStore = await storeModel.findByIdAndUpdate(
        req.params.id,
        {
          storeName: req.body.storeName,
          storeEmail: req.body.storeEmail,
        },
        { new: true }
      );
      res.status(200).json({ updatedStore, success: true });
    } catch (error) {
      next(error);
    }
  }
);

export const deleteStore = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await storeModel.findById(req.params.id);
      if (!store) {
        return next(createHttpError(404, 'Store not found'));
      }
      if (store.storeImagePublicId) {
        await cloudinary.uploader.destroy(store.storeImagePublicId);
      }
      await store.deleteOne();
      res
        .status(200)
        .json({ message: 'Store deleted successfully', success: true });
    } catch (error) {
      next(error);
    }
  }
);
export const getSingleStore = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await storeModel.findById(req.params.id);
      if (!store) {
        return next(createHttpError(404, 'Store not found'));
      }
      res.status(200).json({ store, success: true });
    } catch (error) {
      next(error);
    }
  }
);

export const getOwnStores = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await storeModel.find({ storeUserId: req.params.id });
      res.status(200).json({ stores, success: true });
    } catch (error) {
      next(error);
    }
  }
);
