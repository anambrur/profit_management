import mongoose from 'mongoose';

const priceSchema = new mongoose.Schema({
  currency: { type: String },
  amount: { type: Number },
});

const productSchema = new mongoose.Schema(
  {
    mart: {
      type: String,
    },
    sku: {
      type: String,
    },
    condition: {
      type: String,
    },
    availability: {
      type: String,
    },
    wpid: {
      type: String,
    },
    upc: {
      type: String,
    },
    gtin: {
      type: String,
    },
    productName: {
      type: String,
    },
    shelf: [{ type: String }],
    productType: {
      type: String,
    },
    price: {
      type: priceSchema,
    },
    cost_of_price: {
      type: String,
      default: '0',
    },
    publishedStatus: {
      type: String,
    },
    lifecycleStatus: {
      type: String,
    },
    isDuplicate: {
      type: Boolean,
      default: false,
    },
    storeID: {
      type: String,
      required: true,
    },
    storeRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
