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
    fulfillmentType: {
      type: String,
    },
    quantity: {
      type: Number,
    },
    productName: {
      type: String,
    },
    productSKU: {
      type: String,
    },
    PurchasePrice: {
      type: String,
    },
    sellPrice: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);
