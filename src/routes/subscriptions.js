import { Router } from 'express';
import { Subscription } from '../models/Subscription.js';
import { Product } from '../models/Product.js';
import { asyncHandler, protect, adminOnly, pageParams } from '../middleware.js';

const router = Router();
router.use(protect);

function nextDate(cadence) {
  const d = new Date();
  d.setMonth(d.getMonth() + (cadence === 'every-2-months' ? 2 : 1));
  return d;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subs = await Subscription.find({ user: req.user._id })
      .populate('items.product', 'slug name price images')
      .sort({ createdAt: -1 });
    res.json({ subscriptions: subs });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { items = [], cadence = 'monthly' } = req.body || {};
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'At least one product required' });
    if (!['monthly', 'every-2-months'].includes(cadence))
      return res.status(400).json({ error: 'Invalid cadence' });
    for (const i of items) {
      if (!(await Product.exists({ _id: i.productId, published: true })))
        return res.status(400).json({ error: 'A product is unavailable' });
    }
    const sub = await Subscription.create({
      user: req.user._id,
      items: items.map((i) => ({
        product: i.productId,
        qty: Math.max(1, Math.min(9, Number(i.qty) || 1)),
      })),
      cadence,
      nextShipDate: nextDate(cadence),
    });
    res.status(201).json({ subscription: sub });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const sub = await Subscription.findOne({ _id: req.params.id, user: req.user._id });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    const { status, cadence, skip } = req.body || {};
    if (status && ['active', 'paused', 'cancelled'].includes(status)) sub.status = status;
    if (cadence && ['monthly', 'every-2-months'].includes(cadence)) sub.cadence = cadence;
    if (skip === true) sub.nextShipDate = nextDate(sub.cadence);
    await sub.save();
    res.json({ subscription: sub });
  })
);

router.get(
  '/admin/all',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const { page, limit, skip } = pageParams(req);
    const filter = status ? { status } : {};
    const [subs, total] = await Promise.all([
      Subscription.find(filter)
        .populate('user', 'name email')
        .populate('items.product', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Subscription.countDocuments(filter),
    ]);
    res.json({ subscriptions: subs, meta: { page, limit, total } });
  })
);

export default router;
