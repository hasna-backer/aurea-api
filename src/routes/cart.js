import { Router } from 'express';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { asyncHandler, protect } from '../middleware.js';
import { getValidCoupon, totalsFor } from '../pricing.js';

const router = Router();
router.use(protect);

async function populatedCart(userId) {
  const cart = await Cart.findOne({ user: userId }).populate('items.product');
  return cart || { user: userId, items: [], couponCode: null };
}

function serialize(cart) {
  const items = (cart.items || [])
    .filter((i) => i.product)
    .map((i) => ({
      productId: i.product._id,
      slug: i.product.slug,
      name: i.product.name,
      price: i.product.price,
      image: i.product.images?.[0],
      stock: i.product.stock,
      qty: i.qty,
    }));
  return { items, couponCode: cart.couponCode || null };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await populatedCart(req.user._id);
    const data = serialize(cart);
    const coupon = await getValidCoupon(cart.couponCode);
    res.json({ ...data, totals: totalsFor(data.items, coupon) });
  })
);

router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const { productId, slug, qty = 1, replace = false } = req.body || {};
    const product = productId
      ? await Product.findById(productId)
      : await Product.findOne({ slug: String(slug || '').toLowerCase() });
    if (!product || !product.published)
      return res.status(404).json({ error: 'Product not found' });
    const n = Math.max(1, Math.min(99, Number(qty) || 1));
    if (product.stock < n) return res.status(400).json({ error: `Only ${product.stock} in stock` });
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });
    const line = cart.items.find((i) => i.product.toString() === product._id.toString());
    if (line) line.qty = replace ? n : Math.min(99, line.qty + n);
    else cart.items.push({ product: product._id, qty: n });
    await cart.save();
    const full = await populatedCart(req.user._id);
    const data = serialize(full);
    res.json({ ...data, totals: totalsFor(data.items, await getValidCoupon(full.couponCode)) });
  })
);

router.put(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const qty = Math.max(0, Math.min(99, Number(req.body?.qty) || 0));
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ error: 'Cart empty' });
    if (qty === 0) cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId);
    else {
      const line = cart.items.find((i) => i.product.toString() === req.params.productId);
      if (!line) return res.status(404).json({ error: 'Item not in cart' });
      line.qty = qty;
    }
    await cart.save();
    const full = await populatedCart(req.user._id);
    const data = serialize(full);
    res.json({ ...data, totals: totalsFor(data.items, await getValidCoupon(full.couponCode)) });
  })
);

router.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId);
      await cart.save();
    }
    const full = await populatedCart(req.user._id);
    const data = serialize(full);
    res.json({ ...data, totals: totalsFor(data.items, await getValidCoupon(full.couponCode)) });
  })
);

router.post(
  '/coupon',
  asyncHandler(async (req, res) => {
    const { code } = req.body || {};
    const coupon = await getValidCoupon(code);
    if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon' });
    const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
    cart.couponCode = coupon.code;
    await cart.save();
    const full = await populatedCart(req.user._id);
    const data = serialize(full);
    res.json({ ...data, totals: totalsFor(data.items, coupon) });
  })
);

router.delete(
  '/coupon',
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.couponCode = undefined;
      await cart.save();
    }
    res.json({ ok: true });
  })
);

// Merge guest (localStorage) cart on login
router.post(
  '/merge',
  asyncHandler(async (req, res) => {
    const guest = Array.isArray(req.body?.items) ? req.body.items : [];
    let cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
    for (const g of guest) {
      const product = g.slug
        ? await Product.findOne({ slug: String(g.slug).toLowerCase(), published: true })
        : null;
      if (!product) continue;
      const n = Math.max(1, Math.min(99, Number(g.qty) || 1));
      const line = cart.items.find((i) => i.product.toString() === product._id.toString());
      if (line) line.qty = Math.min(99, line.qty + n);
      else cart.items.push({ product: product._id, qty: n });
    }
    await cart.save();
    const full = await populatedCart(req.user._id);
    const data = serialize(full);
    res.json({ ...data, totals: totalsFor(data.items, await getValidCoupon(full.couponCode)) });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await Cart.findOneAndDelete({ user: req.user._id });
    res.json({ ok: true });
  })
);

export default router;
