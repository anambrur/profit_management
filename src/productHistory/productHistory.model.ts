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
    purchaseQuantity: {
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

export default mongoose.model('ProductHistory', productHistorySchema);

// Create error model schema
const errorSchema = new mongoose.Schema({
  uploadId: String,
  rowIndex: Number,
  rowData: Object,
  errorType: String,
  errorMessage: String,
  timestamp: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false },
});

const UploadError = mongoose.model('UploadError', errorSchema);

export { UploadError };
