import { Router } from 'express';
import {
  assignPermissionsToRole,
  createRole,
  deleteRole,
  getAllRoles,
  getRoleById,
  revokePermissionsFromRole,
  updateRole,
} from './role.controller.js';

const roleRouter = Router();

roleRouter.post('/create', createRole);
roleRouter.get('/all', getAllRoles);
roleRouter.get('/:id', getRoleById);
roleRouter.put('/:id', updateRole);
roleRouter.delete('/:id', deleteRole);
roleRouter.post('/:id/permissions/assign', assignPermissionsToRole);
roleRouter.post('/:id/permissions/revoke', revokePermissionsFromRole);

export default roleRouter;
