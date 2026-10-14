import { Router } from 'express';
import { Product } from '../models/Product.js';
import { asyncHandler, protect, adminOnly, pageParams } from '../middleware.js';

const router = Router();

function escapeRegex(s) {
  return String(s).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, step, all, page, limit, skip } = { ...req.query, ...pageParams(req, 50, 100) };
    const filter = {};
    if (all !== '1') filter.published = true;
    if (step) filter.step = step;
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, meta: { page, limit, total } });
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
    const { slug, name, tagline, description, howToUse, ingredients, price, compareAtPrice, images, step, stock, lowStockAt, published } = req.body || {};
    const product = await Product.create({
      slug, name, tagline, description, howToUse, ingredients, price, compareAtPrice,
      images: Array.isArray(images) ? images.slice(0, 10) : [],
      step, stock, lowStockAt, published,
    });
    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const allowed = ['slug', 'name', 'tagline', 'description', 'howToUse', 'ingredients', 'price', 'compareAtPrice', 'images', 'step', 'stock', 'lowStockAt', 'published'];
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    );
    if (Array.isArray(patch.images)) patch.images = patch.images.slice(0, 10);
    const product = await Product.findByIdAndUpdate(req.params.id, patch, {
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
