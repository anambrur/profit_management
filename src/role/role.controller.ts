/* eslint-disable @typescript-eslint/no-explicit-any */
import expressAsyncHandler from 'express-async-handler';
import roleModel from './role.model';

export const createRole = expressAsyncHandler(async (req, res) => {
  const { name } = req.body;
  try {
    const role = await roleModel.create({ name });
    res.status(201).json(role);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Error creating role', error: err.message });
  }
});

export const assignPermissionsToRole = expressAsyncHandler(async (req, res) => {
  const { roleName } = req.params;
  const { permissions } = req.body;
  try {
    const role = await roleModel.findOne({ name: roleName });
    await role.givePermissionTo(permissions);
    await role.populate('permissions');
    res.status(200).json(role);
  } catch (err : any) {
    res.status(500).json({ message: 'Assign failed', error: err.message });
  }
});
