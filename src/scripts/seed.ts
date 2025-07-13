import connectDB from '../db/dbConnection';
import permissionModel from '../permission/permission.model';
import roleModel from '../role/role.model';
import storeModel from '../store/store.model';
import userModel from '../user/user.model';

const seed = async () => {
  try {
    await connectDB();

    // Clear existing data first
    await Promise.all([
      permissionModel.deleteMany({}),
      roleModel.deleteMany({}),
      userModel.deleteMany({ email: 'admin@gmail.com' }) // Only delete the admin user if it exists
    ]);

    const model = [
      'user',
      'role',
      'permission',
      'order',
      'product',
      'product-history',
      'profit-analyzer',
      'store',
    ];

    const actions = ['create', 'view', 'edit', 'delete'];

    // Create permissions and collect their names
    const permissions = [];
    for (const m of model) {
      for (const a of actions) {
        const permission = await permissionModel.create({ name: `${m}:${a}` });
        permissions.push(permission.name);
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
    const stores = await storeModel.find();


    // Create admin user
    const admin = await userModel.create({
      name: 'Admin',
      email: 'admin@gmail.com',
      password: '12345678',
      allowedStores: stores.map((store) => store._id), // Note: This should be hashed in your user model's pre-save hook
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
    // Note: Removing process.exit() as it would terminate your server
    // Only use process.exit() if this is meant to be a standalone script
  }
};

export default seed;