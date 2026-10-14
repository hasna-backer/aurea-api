import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aurea',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3002',
  stripeKey: process.env.STRIPE_SECRET_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'hello@aurea.example',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

export const isStripeLive = Boolean(config.stripeKey);
