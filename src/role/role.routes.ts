import { Router } from 'express';
import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  assignPermissionsToRole,
  revokePermissionsFromRole,
} from './role.controller';

import authenticateUser from '../middlewares/authenticateUser.js';
import { hasPermission } from '../middlewares/checkPermission';

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
roleRouter.post(
  '/:id/permissions/revoke',
  authenticateUser,
  hasPermission('role:edit'),
  revokePermissionsFromRole
);

export default roleRouter;
