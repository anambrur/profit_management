import mongoose, { Schema } from 'mongoose';
import { IPermission } from '../types/role-permission';

const permissionSchema: Schema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  description: { 
    type: String,
    default: ''
  },
}, {
  timestamps: true
});

export default mongoose.model<IPermission>('Permission', permissionSchema);