import { IUser } from '../role-permission';

// types/express/index.d.ts
declare namespace Express {
  export interface Request {
    user?: IUser;
  }
}


