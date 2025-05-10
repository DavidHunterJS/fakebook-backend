// src/config/roles.ts
export enum Role {
    USER = 'user',
    MODERATOR = 'moderator',
    ADMIN = 'admin'
  }
  
  export enum Permission {
    EDIT_OWN_POST = 'edit:own:post',
    DELETE_OWN_POST = 'delete:own:post',
    EDIT_ANY_POST = 'edit:any:post',
    DELETE_ANY_POST = 'delete:any:post',
    BAN_USER = 'ban:user',
    VIEW_ADMIN_DASHBOARD = 'view:admin-dashboard',
    CREATE_POST = 'create:post',
    DELETE_POST = 'delete:post',
    EDIT_USER = 'edit:user',
    DELETE_USER = 'delete:user',
    MANAGE_USERS = 'manage:users',
    // ... more permissions
  }
  
  export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    [Role.USER]: [
      Permission.CREATE_POST,
      Permission.EDIT_OWN_POST,
      Permission.DELETE_OWN_POST,
    ],
    [Role.MODERATOR]: [
      Permission.CREATE_POST,
      Permission.EDIT_OWN_POST,
      Permission.DELETE_OWN_POST,
      Permission.EDIT_ANY_POST,
      Permission.DELETE_ANY_POST,
    ],
    [Role.ADMIN]: [
      Permission.CREATE_POST,
      Permission.EDIT_OWN_POST,
      Permission.DELETE_OWN_POST,
      Permission.EDIT_ANY_POST,
      Permission.DELETE_ANY_POST,
      Permission.BAN_USER,
      // ... all permissions
    ]
  };