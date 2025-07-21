import { Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import roleModel from './role.model.js';

// Create role
export const createRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { name } = req.body;

    const role = await roleModel.create({ name });

    res.status(201).json({
      success: true,
      data: role,
    });
  }
);

// Get all roles with permissions
export const getAllRoles = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const roles = await roleModel
      .find()
      .populate('permissions')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: roles,
    });
  }
);

// Get role by ID with permissions
export const getRoleById = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const role = await roleModel
      .findById(req.params.id)
      .populate('permissions');

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: role,
    });
  }
);

// Update role name
export const updateRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { name } = req.body;

    const role = await roleModel
      .findByIdAndUpdate(
        req.params.id,
        { name },
        { new: true, runValidators: true }
      )
      .populate('permissions');

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: role,
    });
  }
);

// Delete role
export const deleteRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const role = await roleModel.findByIdAndDelete(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  }
);

// Assign permissions to role
export const assignPermissionsToRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { permissions } = req.body;

    const role = await roleModel.findById(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    await role.givePermissionTo(permissions);
    await role.populate('permissions');

    res.status(200).json({
      success: true,
      data: role,
    });
  }
);

// Update all permissions for a role (replace existing permissions)
export const updatePermissionsToRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { permissionNames }: { permissionNames: string[] } = req.body;

    // Find the role
    const role = await roleModel.findById(req.params.id);
    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    role.permissions = [];
    await role.save();

    // Now assign the new permissions using your schema method
    const updatedRole = await role.givePermissionTo(permissionNames);
    await updatedRole.populate('permissions');

    res.status(200).json({
      success: true,
      data: updatedRole,
    });
  }
);

// Revoke permissions from role
export const revokePermissionsFromRole = expressAsyncHandler(
  async (req: Request, res: Response) => {
    const { permissions } = req.body;

    const role = await roleModel.findById(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Role not found',
      });
      return;
    }

    await role.revokePermissionTo(permissions);
    await role.populate('permissions');

    res.status(200).json({
      success: true,
      data: role,
    });
  }
);
