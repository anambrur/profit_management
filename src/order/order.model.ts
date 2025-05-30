import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    sellerOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      index: true,
    },
    orderDate: {
      type: Date,
      index: true,
    },
    customerName: {
      type: String,
      index: true,
    },
    customerAddress: {
      type: String,
    },
    products: [
      {
        quantity: { type: Number },
        productName: { type: String },
        productSKU: {
          type: String,
          index: true,
        },
        PurchasePrice: { type: String },
        sellPrice: { type: String },
      },
    ],
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1, orderDate: -1 });
OrderSchema.index({ 'products.productSKU': 1, orderDate: -1 });
OrderSchema.index({ customerName: 1, orderDate: -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ updatedAt: -1 });

export default mongoose.model('Order', OrderSchema);