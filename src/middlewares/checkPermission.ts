import { Request, Response, NextFunction } from 'express';
import { IUser } from '../types/role-permission';
import createHttpError from 'http-errors';

type AsyncMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Check if user has permission
export const hasPermission = (permission: string): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'Unauthorized'));
    }

    const user = req.user as IUser;

    try {
      if (await user.hasPermissionTo(permission)) {
        return next();
      }
      return next(
        createHttpError(
          403,
          `Access denied - Required permission: ${permission}`
        )
      );
    } catch (error) {
      console.error(
        `[Permission Middleware] System error verifying "${permission}" access:`,
        error
      );
      return next(
        createHttpError(
          500,
          'System error verifying access permissions - Please try again later'
        )
      );
    }
  };
};

// Check if user has any of the given permissions
export const hasAnyPermission = (permissions: string[]): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'Unauthorized'));
    }

    const user = req.user as IUser;

    try {
      if (await user.hasAnyPermission(permissions)) {
        return next();
      }
      return next(
        createHttpError(403, 'Forbidden - user does not have right permission')
      );
    } catch (error) {
      console.error('Permission check error:', error);
      return next(createHttpError(500, 'Error checking permissions'));
    }
  };
};

// Check if user has role
export const hasRole = (role: string): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'Unauthorized'));
    }

    const user = req.user as IUser;

    try {
      if (await user.hasRole(role)) {
        return next();
      }
      return next(
        createHttpError(403, 'Forbidden - user does not have right role')
      );
    } catch (error) {
      console.error('Role check error:', error);
      return next(createHttpError(500, 'Error checking role'));
    }
  };
};

// Check if user has any of the given roles
export const hasAnyRole = (roles: string[]): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'Unauthorized'));
    }

    const user = req.user as IUser;

    try {
      const results = await Promise.all(
        roles.map((role) => user.hasRole(role))
      );
      if (results.some((hasRole) => hasRole)) {
        return next();
      }
      return next(
        createHttpError(403, 'Forbidden - user does not have right role')
      );
    } catch (error) {
      console.error('Role check error:', error);
      return next(createHttpError(500, 'Error checking roles'));
    }
  };
};

// Optional: Create a higher-order function for checking admin or self
export const checkAdminOrSelf = (
  userIdPath: string = 'params.id'
): AsyncMiddleware => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'Unauthorized'));
    }

    const user = req.user as IUser;
    const targetUserId = userIdPath
      .split('.')
      .reduce((obj, key) => obj?.[key], req);

    try {
      if (
        (await user.hasRole('admin')) ||
        user.id.toString() === targetUserId
      ) {
        return next();
      }
      return next(
        createHttpError(403, 'Forbidden - Admin access or own profile required')
      );
    } catch (error) {
      console.error('Admin or self check error:', error);
      return next(createHttpError(500, 'Error checking permissions'));
    }
  };
};
