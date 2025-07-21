import { Router } from 'express';
import {
  assignPermissionsToRole,
  createRole,
  deleteRole,
  getAllRoles,
  getRoleById,
  revokePermissionsFromRole,
  updatePermissionsToRole,
  updateRole,
} from './role.controller.js';

import authenticateUser from '../middlewares/authenticateUser.js';
import { hasPermission } from '../middlewares/checkPermission.js';

const roleRouter = Router();

roleRouter.post(
  '/create',
  authenticateUser,
  hasPermission('role:create'),
  createRole
);


roleRouter.get(
  '/all',
  authenticateUser,
  hasPermission('role:view'),
  getAllRoles
);


roleRouter.get(
  '/:id',
  authenticateUser,
  hasPermission('role:view'),
  getRoleById
);


roleRouter.put(
  '/:id',
  authenticateUser,
  hasPermission('role:edit'),
  updateRole
);


roleRouter.delete(
  '/:id',
  authenticateUser,
  hasPermission('role:delete'),
  deleteRole
);


roleRouter.post(
  '/:id/permissions/assign',
  authenticateUser,
  hasPermission('role:edit'),
  assignPermissionsToRole
);

roleRouter.put(
  '/:id/permissions',
  authenticateUser,
  hasPermission('role:edit'),
  updatePermissionsToRole
);


roleRouter.post(
  '/:id/permissions/revoke',
  authenticateUser,
  hasPermission('role:edit'),
  revokePermissionsFromRole
);

export default roleRouter;
