import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    tagline: String,
    description: String,
    howToUse: String,
    ingredients: String,
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: Number,
    images: [{ type: String }],
    step: { type: String, enum: ['cleanse', 'treat', 'seal', 'bundle'], default: 'treat' },
    stock: { type: Number, default: 0, min: 0 },
    lowStockAt: { type: Number, default: 10 },
    published: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Product = mongoose.model('Product', productSchema);
