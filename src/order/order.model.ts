import mongoose, { Document, Schema } from 'mongoose';

interface IProductItem {
  productName: string;
  productSKU: string;
  purchasePrice?: number;
  sellPrice?: number;
  quantity: number;
}

interface IOrder extends Document {
  sellerOrderId: string;
  status: string;
  customer: string;
  customerAddress: string;
  orderDate: Date;
  products: IProductItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema: Schema = new Schema({
  productName: {
    type: String,
  },
  productSKU: {
    type: String,
  },
  purchasePrice: {
    type: Number,
  },
  sellPrice: {
    type: Number,
  },
  quantity: {
    type: Number,
  },
});

const OrderSchema: Schema = new Schema(
  {
    sellerOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
    },
    customer: {
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

export default mongoose.model<IOrder>('Order', OrderSchema);
