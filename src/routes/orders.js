import { Router } from 'express';
import Stripe from 'stripe';
import { Cart } from '../models/Cart.js';
import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { asyncHandler, protect, adminOnly } from '../middleware.js';
import { getValidCoupon, totalsFor } from '../pricing.js';
import { config, isStripeLive } from '../config.js';
import { sendMail } from '../email.js';

const router = Router();
const stripe = isStripeLive ? new Stripe(config.stripeKey) : null;

const STATUSES = ['pending', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'];

// Create order from cart. Stripe mode returns clientSecret; dev mode completes immediately.
router.post(
  '/checkout',
  protect,
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0)
      return res.status(400).json({ error: 'Cart is empty' });

    const items = [];
    for (const line of cart.items) {
      const p = line.product;
      if (!p || !p.published) return res.status(400).json({ error: 'A product is unavailable' });
      if (p.stock < line.qty)
        return res.status(400).json({ error: `${p.name}: only ${p.stock} in stock` });
      items.push({
        product: p._id,
        name: p.name,
        price: p.price,
        qty: line.qty,
        image: p.images?.[0],
      });
    }

    const coupon = await getValidCoupon(cart.couponCode);
    const totals = totalsFor(items, coupon);
    const addr = req.body?.shippingAddress || {};
    if (!addr.line1 || !addr.city || !addr.zip || !req.body?.email)
      return res.status(400).json({ error: 'Email + shipping address (line1, city, zip) required' });

    const order = await Order.create({
      user: req.user._id,
      email: req.body.email,
      items,
      ...totals,
      couponCode: coupon?.code,
      shippingAddress: addr,
      paymentProvider: stripe ? 'stripe' : 'dev',
    });

    if (stripe) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(totals.total * 100),
        currency: 'usd',
        receipt_email: req.body.email,
        metadata: { orderId: order._id.toString() },
      });
      order.paymentIntentId = intent.id;
      await order.save();
      return res.status(201).json({ order, clientSecret: intent.client_secret, stripe: true });
    }

    await finalizePaidOrder(order, coupon);
    res.status(201).json({ order, stripe: false, dev: true });
  })
);

// Confirm a Stripe order after client-side payment (webhook would be phase 2)
router.post(
  '/:id/confirm',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.json({ order });
    if (stripe && order.paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (intent.status !== 'succeeded')
        return res.status(400).json({ error: `Payment is ${intent.status}` });
    }
    const coupon = order.couponCode ? await Coupon.findOne({ code: order.couponCode }) : null;
    await finalizePaidOrder(order, coupon);
    res.json({ order });
  })
);

async function finalizePaidOrder(order, coupon) {
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.qty } });
  }
  if (coupon) {
    coupon.usedCount += 1;
    await coupon.save();
  }
  order.status = 'paid';
  order.paidAt = new Date();
  await order.save();
  await Cart.findOneAndDelete({ user: order.user });
  await sendMail({
    to: order.email,
    subject: `Aurea order confirmed (demo) #${order._id}`,
    text: `Thanks! ${order.items.length} item(s), total $${order.total}. Status: paid.`,
  });
}

router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  })
);

router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  })
);

// Admin
router.get(
  '/admin/all',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ orders });
  })
);

router.put(
  '/admin/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status, trackingNumber } = req.body || {};
    if (status && !STATUSES.includes(status))
      return res.status(400).json({ error: `Status must be one of ${STATUSES.join(', ')}` });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (status) order.status = status;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    await order.save();
    res.json({ order });
  })
);

export default router;
