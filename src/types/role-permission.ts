import { Document, Schema, Types } from 'mongoose';

export interface IPermission extends Document {
  name: string;
  description?: string;
}

export interface IRole extends Document {
  name: string;
  permissions: Types.ObjectId[];
  givePermissionTo(permissionNames: string[]): Promise<IRole>;
  revokePermissionTo(permissionNames: string[]): Promise<IRole>;
  hasPermissionTo(permissionName: string): Promise<boolean>;
}

export interface IUser extends Document {
  name: string;
  email: string;
  username?: string;
  phone?: string;
  address?: string;
  password: string;
  roles: Schema.Types.ObjectId[] | IRole[];
  status: 'active' | 'inactive';
  profileImage?: string;
  profileImagePublicId?: string;
  lastLogin?: Date;
  allowedStores: Schema.Types.ObjectId[];

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  assignRole(roleNames: string[]): Promise<IUser>;
  removeRole(roleNames: string[]): Promise<IUser>;
  hasRole(roleName: string): Promise<boolean>;
  hasPermissionTo(permissionName: string): Promise<boolean>;
  hasAnyPermission(permissionNames: string[]): Promise<boolean>;
}
