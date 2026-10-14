import { Router } from 'express';
import { Review } from '../models/Review.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { asyncHandler, protect, adminOnly } from '../middleware.js';

const router = Router();

async function refreshRating(productId) {
  const agg = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    ratingAvg: agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0,
    ratingCount: agg[0]?.count || 0,
  });
}

router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ product: req.params.productId, status: 'approved' })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ reviews });
  })
);

router.post(
  '/product/:productId',
  protect,
  asyncHandler(async (req, res) => {
    const { rating, title, text } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'Rating 1-5 required' });
    if (!text?.trim()) return res.status(400).json({ error: 'Review text required' });
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const bought = await Order.exists({
      user: req.user._id,
      status: { $in: ['paid', 'fulfilled', 'shipped', 'delivered'] },
      'items.product': product._id,
    });
    const review = await Review.create({
      product: product._id,
      user: req.user._id,
      rating,
      title: title?.slice(0, 120),
      text: text.trim().slice(0, 2000),
      verified: Boolean(bought),
    });
    await refreshRating(product._id);
    res.status(201).json({ review });
  })
);

router.post(
  '/:id/helpful',
  asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpful: 1 } },
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ helpful: review.helpful });
  })
);

// Admin moderation
router.get(
  '/admin/all',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const reviews = await Review.find(status ? { status } : {})
      .populate('user', 'name email')
      .populate('product', 'name slug')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ reviews });
  })
);

router.put(
  '/admin/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['pending', 'approved', 'hidden'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await refreshRating(review.product);
    res.json({ review });
  })
);

export default router;
