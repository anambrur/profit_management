import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: true,
      index: true,
    },
    shipNodeType: {
      type: String,
      index: true,
    },
    customerOrderId: {
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
        imageUrl: { type: String },
        productSKU: {
          type: String,
          index: true,
        },
        PurchasePrice: { type: String },
        sellPrice: { type: String },
        tax: { type: String },
        shipping: { type: String },
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
