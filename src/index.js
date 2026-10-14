import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectDb } from './db.js';
import { errorHandler, notFound } from './middleware.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import orderRoutes, { stripeWebhook } from './routes/orders.js';
import quizRoutes from './routes/quiz.js';
import reviewRoutes from './routes/reviews.js';
import couponRoutes from './routes/coupons.js';
import subscriptionRoutes from './routes/subscriptions.js';
import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: config.clientUrl, credentials: true }));

// Stripe webhook needs the RAW body for signature verification,
// so it is mounted before the JSON parser.
app.post('/api/orders/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) =>
  res.json({ ok: true, stripe: Boolean(config.stripeKey), time: new Date().toISOString() })
);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

await connectDb();
app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
