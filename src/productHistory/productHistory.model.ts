import mongoose from 'mongoose';

const productHistorySchema = new mongoose.Schema({
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
  quantity: {
    type: String,
    default: 0,
  },
  costOfPrice: {
    type: String,
    default: 0,
  },
  sellPrice: {
    type: String,
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
  supplier: {
    type: String,
    trim: true,
    lowercase: true,
  },
  totalPrice: {
    type: String,
    default: 0,
  },
});

export default mongoose.model('ProductHistory', productHistorySchema);
