import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    sellerOrderId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
    },
    orderDate: {
      type: Date,
    },
    customerName: {
      type: String,
    },
    customerAddress: {
      type: String,
    },

    products: [
      {
        quantity: { type: Number },
        productName: { type: String },
        productSKU: { type: String },
        PurchasePrice: { type: String },
        sellPrice: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);