import mongoose from 'mongoose';

const failedOrderSchema = new mongoose.Schema({
  storeId: String,
  storeObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  orderId: String,
  reason: String,
  error: String,
  sku: String,
  date: { type: Date, default: Date.now },
});

export default mongoose.model('FailedOrder', failedOrderSchema);
