import { Router } from 'express';
import { Coupon } from '../models/Coupon.js';
import { asyncHandler, protect, adminOnly } from '../middleware.js';
import { getValidCoupon } from '../pricing.js';

const router = Router();

router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const coupon = await getValidCoupon(req.body?.code);
    if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon' });
    res.json({
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrder: coupon.minOrder,
      },
    });
  })
);

router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  res.json({ coupons: await Coupon.find().sort({ createdAt: -1 }) });
}));

router.post(
  '/',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.create({ ...req.body, code: req.body.code?.toUpperCase() });
    res.status(201).json({ coupon });
  })
);

router.put(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ coupon });
  })
);

router.delete(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ ok: true });
  })
);

export default router;
