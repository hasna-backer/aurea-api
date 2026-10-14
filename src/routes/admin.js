import { Router } from 'express';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { asyncHandler, protect, adminOnly, sanitizeUser, pageParams } from '../middleware.js';

const router = Router();
router.use(protect, adminOnly);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const paid = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'fulfilled', 'shipped', 'delivered'] } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    const refunded = await Order.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    const byStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const [customers, lowStock, pendingReviews, unreadMessages, activeSubs] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments({ $expr: { $lte: ['$stock', '$lowStockAt'] } }),
      Review.countDocuments({ status: 'pending' }),
      ContactMessage.countDocuments({ read: false }),
      Subscription.countDocuments({ status: 'active' }),
    ]);
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(10);
    res.json({
      stats: {
        // Net revenue: collected minus refunded.
        revenue: (paid[0]?.revenue || 0) - (refunded[0]?.total || 0),
        paidOrders: paid[0]?.count || 0,
        byStatus,
        customers,
        lowStock,
        pendingReviews,
        unreadMessages,
        activeSubs,
      },
      recentOrders,
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageParams(req);
    const [users, total] = await Promise.all([
      User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(),
    ]);
    res.json({ users: users.map(sanitizeUser), meta: { page, limit, total } });
  })
);

router.put(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!['customer', 'admin'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    if (req.user._id.toString() === req.params.id && role !== 'admin')
      return res.status(400).json({ error: 'You cannot demote yourself' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
  })
);

export default router;
