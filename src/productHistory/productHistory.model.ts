import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    default: '',
  },
  link: {
    type: String,
    trim: true,
  },
});

const productHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    storeID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    orderId: {
      type: String,
      trim: true,
    },
    purchaseQuantity: {
      type: Number,
      default: 0,
    },
    receiveQuantity: {
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
    upc: {
      type: String,
    },
    // quantity: {
    //   type: Number,
    //   default: 0,
    // },
    costOfPrice: {
      type: Number,
      default: 0,
    },
    sellPrice: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
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
    totalPrice: {
      type: String,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('ProductHistory', productHistorySchema);
