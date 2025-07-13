import { Router } from 'express';
import {
  createPermission,
  deletePermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
} from './permission.controller.js';

const permissionRouter = Router();

permissionRouter.post('/', createPermission);
permissionRouter.get('/all', getAllPermissions);
permissionRouter.get('/:id', getPermissionById);
permissionRouter.put('/:id', updatePermission);
permissionRouter.delete('/:id', deletePermission);

export default permissionRouter;
