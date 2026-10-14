import { Router } from 'express';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { asyncHandler, protect, adminOnly, sanitizeUser } from '../middleware.js';

const router = Router();
router.use(protect, adminOnly);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const paid = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'fulfilled', 'shipped', 'delivered'] } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
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
        revenue: paid[0]?.revenue || 0,
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
    const users = await User.find().sort({ createdAt: -1 }).limit(200);
    res.json({ users: users.map(sanitizeUser) });
  })
);

router.put(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!['customer', 'admin'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
  })
);

export default router;
