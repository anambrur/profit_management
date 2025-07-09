import { Request, Response, NextFunction } from 'express';
import { IUser } from '../types/role-permission';

type AsyncMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

// Check if user has permission
export const hasPermission = (permission: string): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = req.user as IUser;
    
    try {
      if (await user.hasPermissionTo(permission)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

// Check if user has any of the given permissions
export const hasAnyPermission = (permissions: string[]): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = req.user as IUser;
    
    try {
      if (await user.hasAnyPermission(permissions)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions'
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

// Check if user has role
export const hasRole = (role: string): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = req.user as IUser;
    
    try {
      if (await user.hasRole(role)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient role'
      });
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking role'
      });
    }
  };
};

// Check if user has any of the given roles
export const hasAnyRole = (roles: string[]): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = req.user as IUser;
    
    try {
      const results = await Promise.all(roles.map(role => user.hasRole(role)));
      if (results.some(hasRole => hasRole)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient role'
      });
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking roles'
      });
    }
  };
};
