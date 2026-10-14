import { Router } from 'express';
import { Product } from '../models/Product.js';
import { asyncHandler, protect, adminOnly } from '../middleware.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, step, all } = req.query;
    const filter = {};
    if (all !== '1') filter.published = true;
    if (step) filter.step = step;
    if (q) filter.name = { $regex: String(q).slice(0, 60), $options: 'i' };
    const products = await Product.find(filter).sort({ createdAt: 1 });
    res.json({ products });
  })
);

router.get(
  '/low-stock',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const products = await Product.find({
      $expr: { $lte: ['$stock', '$lowStockAt'] },
    }).sort({ stock: 1 });
    res.json({ products });
  })
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ slug: req.params.slug.toLowerCase() });
    if (!product || (!product.published && req.query.all !== '1'))
      return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  })
);

router.post(
  '/',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.create(req.body);
    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  })
);

router.delete(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  })
);

export default router;
