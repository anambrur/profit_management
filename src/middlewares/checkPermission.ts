/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextFunction, Request, Response } from 'express';
import User from '../user/user.model.js';

export const checkPermission = (permissionName: any) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user.id);
    const allowed = await user.hasPermissionTo(permissionName);
    if (!allowed) return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Permission Error', error: err.message });
  }
};