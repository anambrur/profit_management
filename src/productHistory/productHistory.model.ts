import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
    },
    link: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const productHistorySchema = new mongoose.Schema(
  {
    storeID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    orderId: {
      type: String,
      trim: true,
    },
    upc: {
      type: String,
    },
    sku: {
      type: String,
    },
    purchaseQuantity: {
      type: Number,
      default: 0,
    },
    orderQuantity: {
      type: Number,
      default: 0,
    },
    lostQuantity: {
      type: Number,
      default: 0,
    },
    sendToWFS: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
    },
    costOfPrice: {
      type: Number,
      default: 0,
    },
    sellPrice: {
      type: Number,
      default: 0,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    card: {
      type: String,
      trim: true,
      lowercase: true,
    },
    supplier: supplierSchema,
  },
  {
    timestamps: true,
  }
);
productHistorySchema.index({ sku: 1, upc: 1 });
productHistorySchema.index({ storeID: 1, createdAt: -1 });

export default mongoose.model('ProductHistory', productHistorySchema);
