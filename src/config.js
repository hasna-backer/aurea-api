import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aurea',
  jwtSecret: process.env.JWT_SECRET || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3002',
  stripeKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  mailFrom: process.env.MAIL_FROM || 'hello@aurea.example',
  // Explicit opt-in only: never return raw tokens in API responses unless this is '1'.
  // Used by automated tests; always off in production.
  devTokens: process.env.ALLOW_DEV_TOKENS === '1',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET must be set (no insecure default)');
}

export const isStripeLive = Boolean(config.stripeKey);
