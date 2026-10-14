import mongoose from 'mongoose';

const cartItem = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItem],
    couponCode: String,
  },
  { timestamps: true }
);

export const Cart = mongoose.model('Cart', cartSchema);
