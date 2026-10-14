import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        qty: { type: Number, default: 1, min: 1 },
        _id: false,
      },
    ],
    cadence: { type: String, enum: ['monthly', 'every-2-months'], default: 'monthly' },
    status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
    nextShipDate: Date,
  },
  { timestamps: true }
);

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
