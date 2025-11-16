import { Role, Permission, ROLE_PERMISSIONS } from './roles';

export class RBACMatrix {
  static hasPermission(role: Role, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.includes(permission);
  }

  static getPermissions(role: Role): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  static canManageRole(actorRole: Role, targetRole: Role): boolean {
    if (actorRole === Role.OWNER) {
      return true;
    }

    if (actorRole === Role.ADMIN) {
      return targetRole !== Role.OWNER;
    }

    return false;
  }

  static getRoleHierarchy(role: Role): number {
    const hierarchy: Record<Role, number> = {
      [Role.OWNER]: 4,
      [Role.ADMIN]: 3,
      [Role.OPERATOR]: 2,
      [Role.AUDITOR]: 1
    };

    return hierarchy[role] || 0;
  }
}
