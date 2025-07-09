import { Router } from 'express';
import {
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission
} from './permission.controller';

const permissionRouter = Router();

permissionRouter.post('/', createPermission);
permissionRouter.get('/all', getAllPermissions);
permissionRouter.get('/:id', getPermissionById);
permissionRouter.put('/:id', updatePermission);
permissionRouter.delete('/:id', deletePermission);

export default permissionRouter;