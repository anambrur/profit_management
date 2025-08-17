/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from 'bcryptjs';
import mongoose, { Schema } from 'mongoose';
import { IPermission, IRole, IUser } from '../types/role-permission.js';

const SALT_WORK_FACTOR = 10;

const userSchema: Schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
    },
    address: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    roles: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Role',
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    profileImage: {
      type: String,
      default: null,
    },
    profileImagePublicId: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    allowedStores: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);
userSchema.index({ allowedStores: 1 });

// Password hashing middleware
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});


// Assign role to user
userSchema.methods.assignRole = async function (
  this: IUser,
  roleNames: string[]
): Promise<IUser> {
  const Role = mongoose.model<IRole>('Role');
  const roles = await Role.find({ name: { $in: roleNames } });

  // Add new roles and remove duplicates
  // @ts-ignore
  this.roles = [
    ...new Set([
      ...this.roles.map((id) => id.toString()),
      ...roles.map((r) => r.id.toString()),
    ]),
  ].map((id) => new mongoose.Types.ObjectId(id));

  return this.save();
};

// Remove roles from user
userSchema.methods.removeRole = async function (
  this: IUser,
  roleNames: string[]
): Promise<IUser> {
  const Role = mongoose.model<IRole>('Role');
  const roles = await Role.find({ name: { $in: roleNames } });

  const roleIds = roles.map((r) => r.id.toString());
  // @ts-ignore
  this.roles = this.roles.filter((id) => !roleIds.includes(id.toString()));

  return this.save();
};

// Check if user has role
userSchema.methods.hasRole = async function (
  this: IUser,
  roleName: string
): Promise<boolean> {
  await this.populate<{ roles: IRole[] }>('roles');
  // @ts-ignore
  return this.roles.some((role) => role.name === roleName);
};

// Check if user has permission (direct or through roles)
userSchema.methods.hasPermissionTo = async function (
  this: IUser,
  permissionName: string
): Promise<boolean> {
  await this.populate<{
    roles: (IRole & {
      permissions: IPermission[];
    })[];
  }>({
    path: 'roles',
    populate: { path: 'permissions' },
  });

  return this.roles.some((role) =>
    // @ts-ignore
    role.permissions?.some(
      (permission: any) => permission.name === permissionName
    )
  );
};

// Check if user has any of the given permissions
userSchema.methods.hasAnyPermission = async function (
  this: IUser,
  permissionNames: string[]
): Promise<boolean> {
  await this.populate<{
    roles: (IRole & {
      permissions: IPermission[];
    })[];
  }>({
    path: 'roles',
    populate: { path: 'permissions' },
  });

  return this.roles.some((role) =>
    // @ts-ignore
    role.permissions?.some((permission: any) =>
      permissionNames.includes(permission.name)
    )
  );
};

export default mongoose.model<IUser>('User', userSchema);
