import { Router } from 'express';
import {
  createPermission,
  deletePermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
} from './permission.controller.js';

import { hasPermission } from '../middlewares/checkPermission.js';

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
