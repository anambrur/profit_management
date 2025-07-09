import { Router } from 'express';
import { createRole } from './role.controller';


const roleRouter = Router();

roleRouter.post('/create-role', createRole);

roleRouter.put('/:roleName/permissions', );


export default roleRouter;
