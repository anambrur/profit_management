import { Router } from 'express';
import {
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission,
} from './permission.controller';

import { hasPermission } from '../middlewares/checkPermission';

const permissionRouter = Router();

permissionRouter.post(
  '/',
  createPermission,
  hasPermission('permission:create')
);
permissionRouter.get(
  '/all',
  getAllPermissions,
  hasPermission('permission:view')
);
permissionRouter.get(
  '/:id',
  getPermissionById,
  hasPermission('permission:view')
);
permissionRouter.put(
  '/:id',
  updatePermission,
  hasPermission('permission:edit')
);
permissionRouter.delete(
  '/:id',
  deletePermission,
  hasPermission('permission:delete')
);

export default permissionRouter;
