/* eslint-disable @typescript-eslint/no-explicit-any */
// models/Role.js
import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
})

// Assign permission to role
roleSchema.methods.givePermissionTo = async function (permissionNames: any) {
  const Permission = mongoose.model('Permission')
  const permissions = await Permission.find({ name: { $in: permissionNames } })
  this.permissions = [...new Set([...this.permissions, ...permissions.map(p => p._id)])]
  return this.save()
}

export default mongoose.model('Role', roleSchema)