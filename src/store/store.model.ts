import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: true,
      unique: true,
    },
    storeName: {
      type: String,
      required: true,
    },
    storeEmail: {
      type: String,
      required: true,
    },
    storeClientId: {
      type: String,
      required: true,
    },
    storeClientSecret: {
      type: String,
      required: true,
    },
    storeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    storeStatus: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    storeImage: {
      type: String,
      default: null,
    },
    storeImagePublicId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Store', storeSchema);
