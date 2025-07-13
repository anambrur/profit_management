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
  createRole,
  authenticateUser,
  hasPermission('role:create')
);
roleRouter.get(
  '/all',
  getAllRoles,
  authenticateUser,
  hasPermission('role:view')
);
roleRouter.get(
  '/:id',
  getRoleById,
  authenticateUser,
  hasPermission('role:view')
);
roleRouter.put(
  '/:id',
  updateRole,
  authenticateUser,
  hasPermission('role:edit')
);
roleRouter.delete(
  '/:id',
  deleteRole,
  authenticateUser,
  hasPermission('role:delete')
);
roleRouter.post(
  '/:id/permissions/assign',
  assignPermissionsToRole,
  authenticateUser,
  hasPermission('role:edit')
);
roleRouter.post(
  '/:id/permissions/revoke',
  revokePermissionsFromRole,
  authenticateUser,
  hasPermission('role:edit')
);

export default roleRouter;
