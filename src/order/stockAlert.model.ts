import mongoose from 'mongoose';

const stockAlertSchema = new mongoose.Schema({
  storeId: String,
  storeObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  orderId: String,
  sku: String,
  reason: String,
  quantityNeeded: Number,
  quantityAvailable: Number,
  date: { type: Date, default: Date.now },
});

export default mongoose.model('StockAlert', stockAlertSchema);
