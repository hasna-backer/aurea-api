import { Coupon } from './models/Coupon.js';

export function totalsFor(items, coupon) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  let discount = 0;
  if (coupon && subtotal >= (coupon.minOrder || 0)) {
    discount =
      coupon.type === 'percent'
        ? Math.round((subtotal * coupon.value) / 100)
        : Math.min(coupon.value, subtotal);
  }
  const shipping = subtotal - discount >= 50 || subtotal === 0 ? 0 : 6;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

export async function getValidCoupon(code) {
  if (!code) return null;
  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (!coupon || !coupon.active) return null;
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return null;
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return null;
  return coupon;
}
