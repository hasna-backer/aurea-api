import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models/User.js';

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, v: user.tokenVersion || 0 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function setAuthCookie(res, token) {
  res.cookie('aurea_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.aurea_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  const user = await User.findById(payload.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  // Session revocation: password resets bump tokenVersion, killing old tokens.
  if ((user.tokenVersion || 0) !== (payload.v || 0))
    return res.status(401).json({ error: 'Session revoked, please log in again' });
  req.user = user;
  next();
});

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Admin only' });
  next();
}

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('[api error]', err);
  if (err?.name === 'CastError')
    return res.status(400).json({ error: 'Invalid id format' });
  if (err?.name === 'ValidationError')
    return res.status(400).json({ error: 'Validation failed', details: err.message });
  if (err?.code === 11000)
    return res.status(409).json({ error: 'Already exists' });
  const status = err.status || 500;
  // Never leak driver/library internals to clients in production.
  if (status >= 500 && process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Server error' });
  res.status(status).json({ error: err.message || 'Server error' });
}

export function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    addresses: user.addresses || [],
    createdAt: user.createdAt,
  };
}

// Simple page/limit helper for admin listings.
export function pageParams(req, def = 50, max = 100) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(max, Number(req.query.limit) || def));
  return { page, limit, skip: (page - 1) * limit };
}
