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
const PAID_FAMILY = ['paid', 'fulfilled', 'shipped', 'delivered'];

// Atomically reserve stock per item. Rolls back earlier reservations on failure,
// so concurrent checkouts for the last unit cannot both succeed.
async function reserveStock(items) {
  const reserved = [];
  for (const item of items) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.qty } },
      { $inc: { stock: -item.qty } },
      { new: true }
    );
    if (!updated) {
      for (const r of reserved) {
        await Product.findByIdAndUpdate(r.product, { $inc: { stock: r.qty } });
      }
      return { ok: false, name: item.name };
    }
    reserved.push(item);
  }
  return { ok: true };
}

async function releaseStock(items) {
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.qty } });
  }
}

// Atomically consume one coupon redemption; fails if the cap was just reached.
async function consumeCoupon(code) {
  if (!code) return null;
  const coupon = await Coupon.findOneAndUpdate(
    {
      code,
      active: true,
      $and: [
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
      ],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  return coupon;
}

async function finalizePaidOrder(order) {
  if (order.status !== 'pending') return order; // idempotent: webhooks retry
  order.status = 'paid';
  order.paidAt = new Date();
  await order.save();
  await Cart.findOneAndDelete({ user: order.user });
  await sendMail({
    to: order.email,
    subject: `Aurea order confirmed (demo) #${order._id}`,
    text: `Thanks! ${order.items.length} item(s), total $${order.total}. Status: paid.`,
  });
  return order;
}

// Create order from cart. Stripe mode returns clientSecret; dev mode completes immediately.
router.post(
  '/checkout',
  protect,
  asyncHandler(async (req, res) => {
    const idempotencyKey =
      req.get('X-Idempotency-Key') || req.body?.idempotencyKey || null;

    // Idempotent retry: same user + key returns the original order.
    if (idempotencyKey) {
      const existing = await Order.findOne({ user: req.user._id, idempotencyKey });
      if (existing) return res.json({ order: existing, deduped: true, stripe: existing.paymentProvider === 'stripe' });
    }

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0)
      return res.status(400).json({ error: 'Cart is empty' });

    const items = [];
    for (const line of cart.items) {
      const p = line.product;
      if (!p || !p.published) return res.status(400).json({ error: 'A product is unavailable' });
      items.push({
        product: p._id,
        name: p.name,
        price: p.price, // server-authoritative: body prices are ignored
        qty: line.qty,
        image: p.images?.[0],
      });
    }

    const coupon = await getValidCoupon(cart.couponCode);
    const totals = totalsFor(items, coupon);
    const addr = req.body?.shippingAddress || {};
    if (!addr.line1 || !addr.city || !addr.zip)
      return res.status(400).json({ error: 'Shipping address (line1, city, zip) required' });

    // Reserve stock + coupon BEFORE creating the order.
    const stock = await reserveStock(items);
    if (!stock.ok) return res.status(409).json({ error: `${stock.name}: not enough stock` });
    let consumedCoupon = null;
    if (coupon) {
      consumedCoupon = await consumeCoupon(coupon.code);
      if (!consumedCoupon) {
        await releaseStock(items);
        return res.status(409).json({ error: 'Coupon just ran out, removed from order' });
      }
    }

    const order = await Order.create({
      user: req.user._id,
      email: req.user.email, // bound to the account, not client input
      items,
      ...totals,
      couponCode: consumedCoupon?.code,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      shippingAddress: {
        name: addr.name || req.user.name,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country || 'US',
        phone: addr.phone,
      },
      paymentProvider: stripe ? 'stripe' : 'dev',
    });

    if (stripe) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(totals.total * 100),
        currency: 'usd',
        receipt_email: order.email,
        metadata: { orderId: order._id.toString() },
      });
      order.paymentIntentId = intent.id;
      await order.save();
      return res.status(201).json({ order, clientSecret: intent.client_secret, stripe: true });
    }

    await finalizePaidOrder(order);
    res.status(201).json({ order, stripe: false, dev: true });
  })
);

// Fallback confirm for Stripe mode when webhooks are not yet delivered.
// Verifies payment state server-side with Stripe before marking paid.
router.post(
  '/:id/confirm',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.json({ order, deduped: true });
    if (stripe && order.paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (intent.status !== 'succeeded')
        return res.status(400).json({ error: `Payment is ${intent.status}` });
    }
    await finalizePaidOrder(order);
    res.json({ order });
  })
);

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
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const filter = status ? { status } : {};
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ orders, meta: { page, limit, total } });
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
    // Restock when a fulfilled-flow order is cancelled/refunded.
    if (
      status &&
      ['cancelled', 'refunded'].includes(status) &&
      PAID_FAMILY.includes(order.status)
    ) {
      await releaseStock(order.items);
      if (order.couponCode) {
        await Coupon.findOneAndUpdate({ code: order.couponCode }, { $inc: { usedCount: -1 } });
      }
    }
    if (status) order.status = status;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    await order.save();
    res.json({ order });
  })
);

export default router;

// Stripe webhook handler (mounted with a raw-body parser in index.js).
// This is the source of truth for live payments; /:id/confirm is only a fallback.
export const stripeWebhook = asyncHandler(async (req, res) => {
  if (!stripe || !config.webhookSecret)
    return res.status(400).json({ error: 'Webhooks not configured' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  if (event.type === 'payment_intent.succeeded') {
    const orderId = event.data.object.metadata?.orderId;
    if (orderId) {
      const order = await Order.findById(orderId);
      if (order) await finalizePaidOrder(order);
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const orderId = event.data.object.metadata?.orderId;
    if (orderId) {
      // Release the reservation so stock is not held by a failed payment.
      const order = await Order.findById(orderId);
      if (order && order.status === 'pending') {
        await releaseStock(order.items);
      }
    }
  }
  res.json({ ok: true });
});
