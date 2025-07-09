import { Router } from 'express';
import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  assignPermissionsToRole,
  revokePermissionsFromRole
} from './role.controller';

const roleRouter = Router();

roleRouter.post('/create', createRole);
roleRouter.get('/all', getAllRoles);
roleRouter.get('/:id', getRoleById);
roleRouter.put('/:id', updateRole);
roleRouter.delete('/:id', deleteRole);
roleRouter.post('/:id/permissions/assign', assignPermissionsToRole);
roleRouter.post('/:id/permissions/revoke', revokePermissionsFromRole);

export default roleRouter;