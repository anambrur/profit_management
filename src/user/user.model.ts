// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      unique: true,
    },
    phone: {
      type: String,
      unique: true,
    },
    address: { type: String },
    password: {
      type: String,
      required: true,
    },

    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], // <-- updated for dynamic roles

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
  },
  {
    timestamps: true,
  }
);

// 🔐 Methods for Spatie-style RBAC
userSchema.methods.assignRole = async function (roleNames: any) {
  const Role = mongoose.model('Role');
  const roles = await Role.find({ name: { $in: roleNames } });
  this.roles = [...new Set([...this.roles, ...roles.map((r) => r._id)])];
  return this.save();
};

userSchema.methods.hasRole = async function (roleName: string) {
  await this.populate('roles');
  return this.roles.some((role: any) => role.name === roleName);
};

userSchema.methods.hasPermissionTo = async function (permissionName: any) {
  await this.populate({
    path: 'roles',
    populate: { path: 'permissions' },
  });
  return this.roles.some((role: any) =>
    role.permissions.some((perm: any) => perm.name === permissionName)
  );
};

export default mongoose.model('User', userSchema);
