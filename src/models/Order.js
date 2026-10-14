import mongoose from 'mongoose';

const orderItem = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    qty: Number,
    image: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true },
    items: [orderItem],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    total: { type: Number, required: true },
    couponCode: String,
    // Client-generated idempotency key: retries of the same checkout
    // return the original order instead of creating a duplicate.
    idempotencyKey: { type: String, sparse: true },
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
      phone: String,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    paymentProvider: { type: String, default: 'dev' },
    paymentIntentId: String,
    trackingNumber: String,
    paidAt: Date,
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, sparse: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export const Order = mongoose.model('Order', orderSchema);
