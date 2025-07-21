import { Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import permissionModel from './permission.model.js';

// Create permission
export const createPermission = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { name, description } = req.body;

    const permission = await permissionModel.create({
      name,
      description: description || '',
    });

    res.status(201).json({
      success: true,
      data: permission,
    });
  }
);

// Get all permissions
export const getAllPermissions = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const permissions = await permissionModel.find().sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: permissions,
    });
  }
);

// Get permission by ID
export const getPermissionById = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const permission = await permissionModel.findById(req.params.id);

    if (!permission) {
      res.status(404).json({
        success: false,
        message: 'Permission not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: permission,
    });
  }
);

// Update permission
export const updatePermission = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { name } = req.body;

    const permission = await permissionModel.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );

    if (!permission) {
      res.status(404).json({
        success: false,
        message: 'Permission not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: permission,
    });
  }
);

// Delete permission
export const deletePermission = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const permission = await permissionModel.findByIdAndDelete(req.params.id);

    if (!permission) {
      res.status(404).json({
        success: false,
        message: 'Permission not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  }
);
