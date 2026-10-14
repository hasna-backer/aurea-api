import { Router } from 'express';
import { ContactMessage } from '../models/ContactMessage.js';
import { asyncHandler, protect, adminOnly, pageParams } from '../middleware.js';
import { sendMail } from '../email.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, topic, message } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !message?.trim())
      return res.status(400).json({ error: 'Name, valid email and message required' });
    const msg = await ContactMessage.create({
      name: name.trim().slice(0, 80),
      email: email.toLowerCase(),
      topic: String(topic || 'General').slice(0, 60),
      message: message.trim().slice(0, 3000),
    });
    await sendMail({
      to: 'support@aurea.example',
      subject: `Contact: ${msg.topic} from ${msg.name} (demo)`,
      text: msg.message,
    });
    res.status(201).json({ ok: true });
  })
);

router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req);
  const [messages, total] = await Promise.all([
    ContactMessage.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    ContactMessage.countDocuments(),
  ]);
  res.json({ messages, meta: { page, limit, total } });
}));

router.put(
  '/:id/read',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const msg = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.json({ message: msg });
  })
);

export default router;
