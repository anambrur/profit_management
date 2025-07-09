import connectDB from '../db/dbConnection';
import permissionModel from '../permission/permission.model';
import roleModel from '../role/role.model';
import userModel from '../user/user.model';

const seed = async () => {
  await connectDB();

  const model = [
    'user',
    'role',
    'permission',
    'order',
    'product',
    'productHistory',
    'profit',
    'store',
  ];

  const actions = ['create', 'view', 'edit', 'delete'];

  for (const m of model) {
    for (const a of actions) {
      await permissionModel.create({ name: `${m}:${a}` });
    }
  }

//   const permissions = [
//     'user:create',
//     'user:read',
//     'user:update',
//     'user:delete',
//     'post:create',
//     'post:read',
//     'post:update',
//     'post:delete',
//   ];
//   await permissionModel.insertMany(permissions.map((name) => ({ name })));

  const adminRole = new roleModel({ name: 'admin' });
  await adminRole.givePermissionTo(permissions);

  const admin = await userModel.create({
    email: 'admin@example.com',
    password: 'hashedpassword',
  });
  await admin.assignRole(['admin']);

  console.log('✅ Seeded roles, permissions, and admin');
  process.exit();
};

seed().catch(console.error);
