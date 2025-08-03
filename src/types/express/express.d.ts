// src/types/store-access.ts
import { Request } from 'express';
import { IUser } from './role-permission';

declare module 'express' {
  interface Request {
    user?: IUser;
    storeId?: string;
  }
}

export type StoreAccessRequest = Request;
