// --------------------------------------------
// 🌟 Spatie-like Dynamic RBAC in Node.js (Mongoose + Express)
// --------------------------------------------

// ✅ MODELS (models/User.js, Role.js, Permission.js)

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Permission
const permissionSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
});
const Permission = model('Permission', permissionSchema);

// Role
const roleSchema = new Schema({
  name: { type: String, required: true, unique: true },
  permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }],
});

// Assign permissions dynamically
roleSchema.methods.givePermissionTo = async function (permissionNames) {
  const perms = await Permission.find({ name: { $in: permissionNames } });
  this.permissions = [
    ...new Set([...this.permissions, ...perms.map((p) => p._id)]),
  ];
  return this.save();
};
const Role = model('Role', roleSchema);

// User
const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
});

userSchema.methods.assignRole = async function (roleNames) {
  const roles = await Role.find({ name: { $in: roleNames } });
  this.roles = [...new Set([...this.roles, ...roles.map((r) => r._id)])];
  return this.save();
};

userSchema.methods.hasRole = async function (roleName) {
  await this.populate('roles');
  return this.roles.some((r) => r.name === roleName);
};

userSchema.methods.hasPermissionTo = async function (permissionName) {
  await this.populate({
    path: 'roles',
    populate: { path: 'permissions' },
  });
  return this.roles.some((role) =>
    role.permissions.some((perm) => perm.name === permissionName)
  );
};
const User = model('User', userSchema);

// ✅ MIDDLEWARE (middlewares/checkPermission.js)
const checkPermission = (permissionName) => async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const allowed = await user.hasPermissionTo(permissionName);
    if (!allowed) return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Permission Error', error: err.message });
  }
};
module.exports = checkPermission;

// ✅ ROUTES (routes/roles.js)
const express = require('express');
const router = express.Router();

// Create role
router.post('/', async (req, res) => {
  const { name } = req.body;
  try {
    const role = await Role.create({ name });
    res.status(201).json(role);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Error creating role', error: err.message });
  }
});

// Assign permissions to role
router.put('/:roleName/permissions', async (req, res) => {
  const { roleName } = req.params;
  const { permissions } = req.body;
  try {
    const role = await Role.findOne({ name: roleName });
    await role.givePermissionTo(permissions);
    await role.populate('permissions');
    res.status(200).json(role);
  } catch (err) {
    res.status(500).json({ message: 'Assign failed', error: err.message });
  }
});
module.exports = router;

// ✅ SEED SCRIPT (scripts/seed.js)
const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const permissions = [
    'user:create',
    'user:read',
    'user:update',
    'user:delete',
    'post:create',
    'post:read',
    'post:update',
    'post:delete',
  ];
  await Permission.insertMany(permissions.map((name) => ({ name })));

  const adminRole = new Role({ name: 'admin' });
  await adminRole.givePermissionTo(permissions);

  const admin = await User.create({
    email: 'admin@example.com',
    password: 'hashedpassword',
  });
  await admin.assignRole(['admin']);

  console.log('✅ Seeded roles, permissions, and admin');
  process.exit();
};

seed().catch(console.error);

// ✅ PROTECTED ROUTE EXAMPLE
const checkPermission = require('../middlewares/checkPermission');
app.post('/api/users', checkPermission('user:create'), (req, res) => {
  res.send('User created');
});
