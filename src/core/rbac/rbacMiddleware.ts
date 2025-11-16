import { Request, Response, NextFunction } from 'express';
import { Role, Permission } from './roles';
import { RBACMatrix } from './rbacMatrix';
import { UnauthorizedError } from '../utils/errors';
import { dal } from '../db/dal';

export interface AuthenticatedRequest extends Request {
  admin?: {
    id: string;
    discordId: string;
    username: string;
    role: Role;
  };
}

export function requireRole(roles: Role | Role[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const adminDiscordId = req.headers['x-admin-discord-id'] as string;

      if (!adminDiscordId) {
        throw new UnauthorizedError('Admin authentication required');
      }

      const admin = await dal.admins.findByDiscordId(adminDiscordId);

      if (!admin) {
        throw new UnauthorizedError('Admin not found');
      }

      const adminRole = admin.permissions[0] as Role;

      if (!allowedRoles.includes(adminRole)) {
        throw new UnauthorizedError('Insufficient permissions');
      }

      req.admin = {
        id: admin.id,
        discordId: admin.discordId,
        username: admin.username,
        role: adminRole
      };

      next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        res.status(401).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      } else {
        next(error);
      }
    }
  };
}

export function requirePermission(permission: Permission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.admin) {
        throw new UnauthorizedError('Admin authentication required');
      }

      if (!RBACMatrix.hasPermission(req.admin.role, permission)) {
        throw new UnauthorizedError(`Permission denied: ${permission}`);
      }

      next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        res.status(401).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      } else {
        next(error);
      }
    }
  };
}
