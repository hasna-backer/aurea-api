# Aurea API — Express + MongoDB (MVP Demo)

Backend for the fictional Aurea skincare storefront.

## Setup

```bash
npm install
cp .env.example .env   # defaults point at local mongod + web on :3002
npm run seed            # 3 products + WELCOME10 coupon + admin@aurea.example / Admin123!
npm run dev             # :4000
```

Health: `GET http://localhost:4000/api/health`

## Endpoint map

- `POST /api/auth/signup|login|logout|verify|forgot|reset`, `GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/addresses`, `POST /api/auth/wishlist/:productId`
- `GET /api/products`, `GET /api/products/:slug`, admin: `POST|PUT|DELETE /api/products...`, `GET /api/products/low-stock`
- `GET|POST /api/cart/items`, `PUT|DELETE /api/cart/items/:productId`, `POST|DELETE /api/cart/coupon`, `POST /api/cart/merge`, `DELETE /api/cart`
- `POST /api/orders/checkout`, `POST /api/orders/:id/confirm`, `GET /api/orders`, `GET /api/orders/:id`, admin: `GET /api/orders/admin/all`, `PUT /api/orders/admin/:id`
- `GET /api/quiz/meta`, `POST /api/quiz/submit`, `GET /api/quiz/:id`
- `GET|POST /api/reviews/product/:productId`, `POST /api/reviews/:id/helpful`, admin: `GET /api/reviews/admin/all`, `PUT /api/reviews/admin/:id`
- `POST /api/coupons/validate`, admin CRUD at `/api/coupons`
- `GET|POST /api/subscriptions`, `PUT /api/subscriptions/:id`, admin: `GET /api/subscriptions/admin/all`
- `POST /api/contact`, admin: `GET /api/contact`, `PUT /api/contact/:id/read`
- Admin: `GET /api/admin/stats`, `GET /api/admin/users`, `PUT /api/admin/users/:id/role`

Auth is an httpOnly cookie (`aurea_token`). Admin routes need `role: admin`.

## Notes

- Stripe: when `STRIPE_SECRET_KEY` is unset, checkout completes in DEV mode (no charge). Set the key for real PaymentIntents.
- Live payments: `POST /api/orders/webhook` (raw body, signature verified with `STRIPE_WEBHOOK_SECRET`) is the source of truth for marking orders paid. `POST /api/orders/:id/confirm` is a fallback that re-verifies with Stripe server-side.
- Idempotency: send `X-Idempotency-Key` (or `idempotencyKey` in the body) with checkout; retries return the original order instead of duplicating.
- Stock is reserved atomically per item at checkout (`stock >= qty` guard + rollback); abandoned Stripe-mode reservations are released on `payment_intent.payment_failed`. Expire stale `pending` orders with a cron in production.
- Auth responses never include raw tokens unless `ALLOW_DEV_TOKENS=1` (tests only, never production). `JWT_SECRET` is required to boot.
- Email: dev mode logs to console. Wire SMTP in phase 2.
- All data is fictional demo content.
