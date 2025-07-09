// models/Permission.js
import mongoose from 'mongoose'

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g. 'user:create'
  description: { type: String },
})

export default mongoose.model('Permission', permissionSchema)