import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 120 },
    text: { type: String, required: true, maxlength: 2000 },
    photos: [{ type: String }],
    verified: { type: Boolean, default: false },
    helpful: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'approved', 'hidden'], default: 'approved' },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });

export const Review = mongoose.model('Review', reviewSchema);
