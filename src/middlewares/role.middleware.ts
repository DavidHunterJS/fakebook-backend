// src/middlewares/role.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Role, Permission, ROLE_PERMISSIONS } from '../config/roles';

export const hasRole = (role: Role) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.user.role !== role && req.user.role !== Role.ADMIN) {
      return res.status(403).json({ message: 'Forbidden - Insufficient role' });
    }

    next();
  };
};

export const hasPermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userRole = req.user.role;
    const userPermissions = ROLE_PERMISSIONS[userRole as Role];

    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ message: 'Forbidden - Insufficient permissions' });
    }

    next();
  };
};

export const isAdmin = (req: Request, res: Response, next: NextFunction): Response | void => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden - Admin access required' });
  }
  next();
};

export const isModerator = (req: Request, res: Response, next: NextFunction): Response | void => {
  if (!req.user || (req.user.role !== Role.MODERATOR && req.user.role !== Role.ADMIN)) {
    return res.status(403).json({ message: 'Forbidden - Moderator access required' });
  }
  next();
};