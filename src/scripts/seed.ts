import connectDB from '../db/dbConnection';
import permissionModel from '../permission/permission.model';
import roleModel from '../role/role.model';
import userModel from '../user/user.model';

const seed = async () => {
  try {
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

    // Create permissions and collect their IDs
    const permissions = [];
    for (const m of model) {
      for (const a of actions) {
        const permission = await permissionModel.create({ name: `${m}:${a}` });
        permissions.push(permission.name); // or permission._id if you need IDs
      }
    }

    // Create admin role with all permissions
    const adminRole = await roleModel.create({ name: 'admin' });
    if (typeof adminRole.givePermissionTo === 'function') {
      await adminRole.givePermissionTo(permissions);
    } else {
      // Fallback if givePermissionTo method doesn't exist
      await roleModel.updateOne(
        { _id: adminRole._id },
        { $set: { permissions } }
      );
    }

    // Create admin user
    const admin = await userModel.create({
      email: 'admin@gmail.com',
      password: '12345678', // Make sure to hash this properly in your user model
    });

    if (typeof admin.assignRole === 'function') {
      await admin.assignRole(['admin']);
    } else {
      // Fallback if assignRole method doesn't exist
      await userModel.updateOne(
        { _id: admin._id },
        { $set: { roles: ['admin'] } }
      );
    }

    console.log('✅ Seeded roles, permissions, and admin');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    process.exit();
  }
};


export default seed;