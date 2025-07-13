import mongoose, { Schema } from 'mongoose';
import { IPermission, IRole } from '../types/role-permission.js';

const roleSchema: Schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    permissions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Assign permission to role
roleSchema.methods.givePermissionTo = async function (
  this: IRole,
  permissionNames: string[]
): Promise<IRole> {
  const Permission = mongoose.model<IPermission>('Permission');
  const permissions = await Permission.find({ name: { $in: permissionNames } });

  // Add new permissions and remove duplicates
  this.permissions = [
    ...new Set([
      ...this.permissions.map((id) => id.toString()),
      ...permissions.map((p) => p.id.toString()),
    ]),
  ].map((id) => new mongoose.Types.ObjectId(id));

  return this.save();
};

// Remove permissions from role
roleSchema.methods.revokePermissionTo = async function (
  this: IRole,
  permissionNames: string[]
): Promise<IRole> {
  const Permission = mongoose.model<IPermission>('Permission');
  const permissions = await Permission.find({ name: { $in: permissionNames } });

  const permissionIds = permissions.map((p) => p.id.toString());
  this.permissions = this.permissions.filter(
    (id) => !permissionIds.includes(id.toString())
  );

  return this.save();
};

// Check if role has permission
roleSchema.methods.hasPermissionTo = async function (
  this: IRole,
  permissionName: string
): Promise<boolean> {
  await this.populate('permissions');
  return this.permissions.some(
    // @ts-ignore
    (permission: IPermission) => permission.name === permissionName
  );
};

export default mongoose.model<IRole>('Role', roleSchema);
