import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    mart: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    condition: {
      type: String,
    },
    availability: {
      type: String,
    },
    wpid: {
      type: String,
      trim: true,
    },
    upc: {
      type: String,
      trim: true,
    },
    gtin: {
      type: String,
      trim: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    productType: {
      type: String,
      trim: true,
    },
    onHand: {
      type: Number,
      default: 0,
    },
    available: {
      type: Number,
      default: 0,
    },
    publishedStatus: {
      type: String,
    },
    lifecycleStatus: {
      type: String,
    },
    storeID: {
      type: String,
    },
    storeRef: {
      type: String,
    },
    purchaseHistory: {
      type: [
        {
          quantity: {
            type: Number,
            default: 0,
          },
          costOfPrice: {
            type: Number,
            default: 0,
          },
          sellPrice: {
            type: Number,
            default: 0,
          },
          date: {
            type: Date,
            default: Date.now,
          },
          email: {
            type: String,
            trim: true,
            lowercase: true,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Product = mongoose.model('Product', productSchema);

export default Product;
