import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import Product from '../product/product.model.js';
import productHistoryModel from './productHistory.model.js';

export const createProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      storeID,
      purchase,
      received,
      lost,
      sentToWfs,
      costOfPrice,
      sellPrice,
      date,
      email,
      card,
      supplier,
    } = req.body;

    // Check if product exists
    const product = await Product.findById(id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }

    // Handle supplier (could be stringified JSON or object)
    let supplierObject: { name: string; link: string } | undefined;

    if (supplier) {
      if (typeof supplier === 'string') {
        try {
          supplierObject = JSON.parse(supplier);
        } catch {
          return res.status(400).json({ message: 'Invalid supplier format' });
        }
      } else if (typeof supplier === 'object') {
        supplierObject = supplier;
      }

      if (!supplierObject?.name || !supplierObject?.link) {
        return res
          .status(400)
          .json({ message: 'Supplier must have name and link' });
      }
    }

    const newProduct = await productHistoryModel.create({
      productId: product._id,
      storeID,
      purchaseQuantity: purchase || 0,
      receiveQuantity: received || 0,
      lostQuantity: lost || 0,
      sendToWFS: sentToWfs || 0,
      costOfPrice: costOfPrice || 0,
      sellPrice: sellPrice || 0,
      date: date || new Date(),
      email: email || '',
      card: card || '',
      supplier: supplierObject,
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

export const getAllProductHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const search = String(
      req.query.sku || req.query.productName || req.query.search || ''
    ).trim();
    console.log('SEARCH VALUE:', search); // 👈 Add this
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

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'product.sku': { $regex: search, $options: 'i' } },
            { 'product.productName': { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    // ✅ Clone pipeline before pagination for count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await productHistoryModel.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // ✅ Pagination setup
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const products = await productHistoryModel.aggregate(pipeline);

    res.status(200).json({
      success: true,
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// Update a single field by step (example: update supplier)
export const updateSingleField = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { field, value } = req.body;

  try {
    const validFields = [
      'orderId',
      'purchaseQuantity',
      'receiveQuantity',
      'lostQuantity',
      'sendToWFS',
      'costOfPrice',
      'sellPrice',
      'date',
      'card',
      'email',
      'status',
      'supplier',
      'upc',
    ];

    if (!validFields.includes(field)) {
      return res.status(400).json({ message: 'Invalid field name' });
    }

    let updateObj;
    if (field === 'supplier') {
      let supplierData;

      try {
        supplierData = JSON.parse(value);
      } catch {
        return res
          .status(400)
          .json({ message: 'Invalid JSON format for supplier' });
      }

      if (!supplierData.supplierName || !supplierData.supplierLink) {
        return res
          .status(400)
          .json({ message: 'Missing supplier name or link' });
      }

      updateObj = {
        supplier: {
          name: supplierData.supplierName,
          link: supplierData.supplierLink,
        },
        updatedAt: new Date(),
      };
    } else {
      // Default single field update
      updateObj = {
        [field]: value,
        updatedAt: new Date(),
      };
    }

    const updatedProduct = await productHistoryModel.findByIdAndUpdate(
      id,
      updateObj,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      message: `${field} updated successfully`,
      updatedProduct,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductHistoryList = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const id = req.params.id;
  try {
    const product = await Product.findById(id);
    if (!product) {
      return next(createHttpError(404, 'Product not found'));
    }
    const productHistoryList = await productHistoryModel.find({
      productId: id,
    });
    const data = {
      ...product.toObject(),
      history: productHistoryList,
    };

    res.status(200).json({ data, success: true });
  } catch (error) {
    next(error);
  }
};
