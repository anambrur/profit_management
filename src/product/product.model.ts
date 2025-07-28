import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    mart: {
      type: String,
      trim: true,
      index: true, // For filtering by mart
    },
    storeId: {
      type: String,
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    condition: {
      type: String,
      index: true, // For filtering by condition
    },
    availability: {
      type: String,
      index: true, // For inventory status checks
    },
    wpid: {
      type: String,
      trim: true,
      index: true, // Alternative identifier
    },
    upc: {
      type: String,
      trim: true,
      index: true, // For barcode lookups
    },
    gtin: {
      type: String,
      trim: true,
      index: true, // For global trade lookups
    },
    productName: {
      type: String,
      trim: true,
      index: 'text', // For text search
    },
    price: {
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'USD',
      },
    },
    productType: {
      type: String,
      trim: true,
      index: true, // For product categorization
    },
    onHand: {
      type: Number,
      default: 0,
      index: true, // For inventory level queries
    },
    available: {
      type: Number,
      default: 0,
      index: true, // Critical for stock availability
    },
    publishedStatus: {
      type: String,
      index: true, // For published/unpublished filters
    },
    lifecycleStatus: {
      type: String,
      index: true, // For product lifecycle management
    },
    storeRef: {
      type: String,
      index: true, // Alternative store reference
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for common query patterns
productSchema.index({ sku: 1, available: 1 }); // Stock availability checks
productSchema.index({ productType: 1, available: 1 }); // Category stock views
productSchema.index({ mart: 1, available: 1 }); // Mart-specific inventory
productSchema.index({
  'purchaseHistory.date': -1,
  'purchaseHistory.costOfPrice': 1,
}); // Purchase analysis

// Text index for product search
productSchema.index(
  {
    productName: 'text',
    sku: 'text',
    upc: 'text',
  },
  {
    weights: {
      productName: 3,
      sku: 2,
      upc: 1,
    },
    name: 'product_search_index',
  }
);

const Product = mongoose.model('Product', productSchema);

export default Product;
