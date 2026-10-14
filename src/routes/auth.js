import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { asyncHandler, protect, sanitizeUser, setAuthCookie, signToken } from '../middleware.js';
import { randomToken, sha256 } from '../tokens.js';
import { sendMail } from '../email.js';
import { config } from '../config.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

function validEmail(email) {
  return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
}

// Dev-only token passthrough for automated tests. Requires explicit opt-in
// (ALLOW_DEV_TOKENS=1) so production can never leak tokens in responses.
function devToken(token) {
  return config.devTokens ? { devToken: token } : {};
}

router.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !validEmail(email) || typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Name, valid email and 8+ char password required' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    // De-oracled: same status/message shape whether or not the email is taken.
    if (exists) return res.status(409).json({ error: 'Unable to create account with those details' });
    const user = new User({ name: name.trim(), email: email.toLowerCase() });
    await user.setPassword(password);
    const verifyToken = randomToken(24);
    user.verifyTokenHash = sha256(verifyToken);
    await user.save();
    await sendMail({
      to: user.email,
      subject: 'Verify your Aurea email (demo)',
      text: `Verify with token: ${verifyToken}\nPOST /api/auth/verify { email, token }`,
    });
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: sanitizeUser(user), ...devToken(verifyToken) });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string')
      return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await user.checkPassword(password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    setAuthCookie(res, signToken(user));
    res.json({ user: sanitizeUser(user) });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie('aurea_token', { path: '/' });
  res.json({ ok: true });
});

router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('wishlist', 'slug name price images');
    res.json({ user: sanitizeUser(user) });
  })
);

router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const { email, token } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase() }).select(
      '+verifyTokenHash'
    );
    if (!user || !token || user.verifyTokenHash !== sha256(token))
      return res.status(400).json({ error: 'Invalid token' });
    user.emailVerified = true;
    user.verifyTokenHash = undefined;
    await user.save();
    res.json({ ok: true });
  })
);

router.post(
  '/forgot',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase() });
    // De-oracled: identical response whether or not the account exists.
    if (user) {
      const token = randomToken(32);
      user.resetTokenHash = sha256(token);
      user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      await sendMail({
        to: user.email,
        subject: 'Reset your Aurea password (demo)',
        text: `Reset token (1h): ${token}\nPOST /api/auth/reset { email, token, password }`,
      });
      if (config.devTokens) return res.json({ ok: true, devResetToken: token });
    }
    res.json({ ok: true });
  })
);

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const { email, token, password } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase() }).select(
      '+resetTokenHash'
    );
    if (
      !user ||
      !token ||
      user.resetTokenHash !== sha256(token) ||
      !user.resetExpires ||
      user.resetExpires < new Date()
    )
      return res.status(400).json({ error: 'Invalid or expired token' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: '8+ char password required' });
    await user.setPassword(password);
    user.resetTokenHash = undefined;
    user.resetExpires = undefined;
    // Revoke all existing sessions (old JWTs carry the previous version).
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ ok: true });
  })
);

router.put(
  '/profile',
  protect,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (name?.trim()) req.user.name = name.trim().slice(0, 80);
    await req.user.save();
    res.json({ user: sanitizeUser(req.user) });
  })
);

router.post(
  '/addresses',
  protect,
  asyncHandler(async (req, res) => {
    const { label, name, line1, line2, city, state, zip, country, phone } = req.body || {};
    if (!line1 || !city || !zip)
      return res.status(400).json({ error: 'line1, city and zip required' });
    req.user.addresses.push({
      label: String(label || 'Home').slice(0, 30),
      name: name?.slice(0, 80),
      line1: String(line1).slice(0, 120),
      line2: line2?.slice(0, 120),
      city: String(city).slice(0, 80),
      state: state?.slice(0, 40),
      zip: String(zip).slice(0, 20),
      country: country?.slice(0, 40) || 'US',
      phone: phone?.slice(0, 30),
    });
    await req.user.save();
    res.status(201).json({ addresses: req.user.addresses });
  })
);

router.delete(
  '/addresses/:id',
  protect,
  asyncHandler(async (req, res) => {
    req.user.addresses = req.user.addresses.filter((a) => a._id.toString() !== req.params.id);
    await req.user.save();
    res.json({ addresses: req.user.addresses });
  })
);

router.post(
  '/wishlist/:productId',
  protect,
  asyncHandler(async (req, res) => {
    const id = req.params.productId;
    const has = req.user.wishlist.some((w) => w.toString() === id);
    req.user.wishlist = has
      ? req.user.wishlist.filter((w) => w.toString() !== id)
      : [...req.user.wishlist, id];
    await req.user.save();
    res.json({ wishlisted: !has });
  })
);

export default router;
