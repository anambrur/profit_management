import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import Product from '../product/product.model';
import productHistoryModel from './productHistory.model';

export const createProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    const newProduct = await productHistoryModel.create({
      productId: product._id,
      ...req.body,
    });
    res.status(201).json({ newProduct, success: true });
  } catch (error) {
    next(error);
  }
};

export const getSingleProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    res.status(200).json({ product, success: true });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    const updatedProduct = await productHistoryModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.status(200).json({ updatedProduct, success: true });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await productHistoryModel.findById(req.params.id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    await product.deleteOne();
    res
      .status(200)
      .json({ message: 'Product deleted successfully', success: true });
  } catch (error) {
    next(error);
  }
};

// export const getAllProductHistory = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const query = req.query;
//     const products = await productHistoryModel
//       .find()
//       .populate('productId')
//       .populate('storeID');

//     res.status(200).json({ products, success: true });
//   } catch (error) {
//     next(error);
//   }
// };

export const getAllProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const pipeline: any[] = [
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'stores',
          localField: 'storeID',
          foreignField: '_id',
          as: 'store',
        },
      },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    ];

    if (req.query.sku) {
      const sku = req.query.sku;
      pipeline.push({
        $match: {
          'product.sku': { $regex: sku as string, $options: 'i' },
        },
      });
    }
    if (req.query.productName) {
      const productName = req.query.productName;
      pipeline.push({
        $match: {
          'product.productName': {
            $regex: productName as string,
            $options: 'i',
          },
        },
      });
    }

    const products = await productHistoryModel.aggregate(pipeline);

    res.status(200).json({ products, success: true });
  } catch (error) {
    next(error);
  }
};
