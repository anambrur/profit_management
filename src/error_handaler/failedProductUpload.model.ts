import mongoose from 'mongoose';

const failedProductUploadSchema = new mongoose.Schema({
  storeId: String,
  storeObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  uploadDate: { type: Date, default: Date.now },
  fileName: String,
  rowData: mongoose.Schema.Types.Mixed, // The original row data
  upc: String,
  orderId: String,
  reason: String, // 'SKIPPED' or 'ERROR'
  errorDetails: String, // Error message if available
  processed: { type: Boolean, default: false },
});

export const FailedProductUploadModel = mongoose.model(
  'FailedProductUpload',
  failedProductUploadSchema
);
