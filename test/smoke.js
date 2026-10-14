// MVP regression suite: exercises every route group against a live API.
// Usage: ALLOW_DEV_TOKENS=1 on the API side, then:
//   API=http://localhost:4000 node test/smoke.js   (API running, DB seeded)
const API = process.env.API || 'http://localhost:4000';
const email = `test${Date.now()}@example.com`;
let cookie = '';
let failures = 0;

async function call(method, path, body, { auth = true, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

console.log(`[smoke] ${API} as ${email}`);

// health + catalog (public)
let r = await call('GET', '/api/health', null, { auth: false });
check('health', r.status === 200 && r.data?.ok, JSON.stringify(r.data));
r = await call('GET', '/api/products', null, { auth: false });
check('list products (3 seeded)', r.status === 200 && r.data?.products?.length === 3, JSON.stringify(r.data)?.slice(0, 200));
const halo = r.data.products.find((p) => p.slug === 'halo-serum');
const cloud = r.data.products.find((p) => p.slug === 'cloud-cleanser');
r = await call('GET', '/api/products?q=(', null, { auth: false });
check('regex metachars escaped (no 500)', r.status === 200 && Array.isArray(r.data?.products), `status=${r.status}`);
r = await call('GET', '/api/products/halo-serum', null, { auth: false });
check('product detail', r.status === 200 && r.data?.product?.slug === 'halo-serum');
r = await call('GET', '/api/quiz/meta', null, { auth: false });
check('quiz meta', r.status === 200 && r.data?.options?.skinType?.length === 4);

// auth (+ de-oracled messages: same 409 shape, no token without opt-in)
r = await call('POST', '/api/auth/signup', { name: 'Smoke Test', email, password: 'Password123!' }, { auth: false });
check('signup 201', r.status === 201 && r.data?.user?.email === email, JSON.stringify(r.data)?.slice(0, 200));
const verifyToken = r.data?.devToken;
r = await call('POST', '/api/auth/signup', { name: 'Dup', email, password: 'Password123!' }, { auth: false });
check('dup signup generic 409 (no oracle details)', r.status === 409 && !/already registered/i.test(r.data?.error || ''), JSON.stringify(r.data));
r = await call('POST', '/api/auth/verify', { email, token: 'bogus' }, { auth: false });
check('bad verify token rejected', r.status === 400);
if (verifyToken) {
  r = await call('POST', '/api/auth/verify', { email, token: verifyToken }, { auth: false });
  check('good verify token accepted', r.status === 200, `status=${r.status}`);
} else {
  check('dev verify token present (ALLOW_DEV_TOKENS=1 on API)', false, 'restart API with ALLOW_DEV_TOKENS=1');
}

// reset revokes old sessions
const preResetCookie = cookie;
r = await call('POST', '/api/auth/forgot', { email }, { auth: false });
check('forgot always ok:true', r.status === 200 && r.data?.ok === true);
const resetToken = r.data?.devResetToken;
if (!resetToken) {
  check('reset token available (ALLOW_DEV_TOKENS=1 on API)', false, 'restart API with ALLOW_DEV_TOKENS=1');
} else {
  r = await call('POST', '/api/auth/reset', { email, token: resetToken, password: 'Newpass123!' }, { auth: false });
  check('password reset ok', r.status === 200);
  const stale = await fetch(`${API}/api/auth/me`, { headers: { Cookie: preResetCookie } });
  check('old session revoked after reset (401)', stale.status === 401, `status=${stale.status}`);
  cookie = '';
  r = await call('POST', '/api/auth/login', { email, password: 'Newpass123!' }, { auth: false });
  check('login with new password', r.status === 200);
  // verify email with a fresh signup is covered below via login session
}

// re-login as main user for the rest (cookie already set from login above)
r = await call('GET', '/api/auth/me');
check('me (cookie auth)', r.status === 200 && r.data?.user?.email === email, `status=${r.status}`);

// quiz
r = await call('POST', '/api/quiz/submit', {
  answers: { skinType: 'oily', concern: 'breakouts', sensitivity: 'sometimes', routine: 'minimal' },
  email,
});
check('quiz submit + hero', r.status === 201 && r.data?.result?.heroProduct, JSON.stringify(r.data)?.slice(0, 200));

// cart + coupon
r = await call('POST', '/api/cart/items', { slug: 'halo-serum', qty: 1 });
check('add to cart', r.status === 200 && r.data?.items?.length === 1, JSON.stringify(r.data)?.slice(0, 200));
r = await call('POST', '/api/cart/items', { slug: 'dune-moisture', qty: 2 });
check('add second item', r.status === 200 && r.data?.items?.length === 2);
r = await call('POST', '/api/coupons/validate', { code: 'WELCOME10' });
check('validate coupon', r.status === 200 && r.data?.coupon?.code === 'WELCOME10');
r = await call('POST', '/api/cart/coupon', { code: 'WELCOME10' });
check('apply coupon + discount>0', r.status === 200 && r.data?.totals?.discount > 0, JSON.stringify(r.data?.totals));

// checkout (dev mode): email bound to account, idempotent on retry
const stockBefore = (await call('GET', '/api/products/cloud-cleanser', null, { auth: false })).data.product.stock;
await call('POST', '/api/cart/items', { slug: 'cloud-cleanser', qty: 1 });
const idemKey = `smoke-${Date.now()}`;
r = await call('POST', '/api/orders/checkout', {
  email: 'attacker@example.com', // must be ignored: bound to account
  shippingAddress: { name: 'Smoke Test', line1: '1 Test Way', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
}, { headers: { 'X-Idempotency-Key': idemKey } });
check('checkout 201 paid (dev)', r.status === 201 && r.data?.order?.status === 'paid', JSON.stringify(r.data)?.slice(0, 300));
check('order email bound to account', r.data?.order?.email === email, `got=${r.data?.order?.email}`);
const orderId = r.data?.order?._id;
r = await call('POST', '/api/orders/checkout', {
  shippingAddress: { name: 'Smoke Test', line1: '1 Test Way', city: 'Austin', state: 'TX', zip: '78701' },
}, { headers: { 'X-Idempotency-Key': idemKey } });
check('idempotent retry returns same order (no dupe)', r.status === 200 && r.data?.order?._id === orderId && r.data?.deduped === true, JSON.stringify(r.data)?.slice(0, 200));
r = await call('GET', '/api/orders');
check('order history has exactly 1 (no dupe)', r.status === 200 && r.data?.orders?.length === 1, `count=${r.data?.orders?.length}`);

// reviews: pending by default, friendly dup message, admin approve -> listed
r = await call('POST', `/api/reviews/product/${halo._id}`, { rating: 5, title: 'Great', text: 'Smells like nothing, works great.' });
check('create verified review (pending)', r.status === 201 && r.data?.review?.verified === true && r.data?.review?.status === 'pending', JSON.stringify(r.data)?.slice(0, 220));
const reviewId = r.data?.review?._id;
r = await call('POST', `/api/reviews/product/${halo._id}`, { rating: 4, text: 'second try' });
check('dup review friendly 409', r.status === 409 && /already reviewed/i.test(r.data?.error || ''), JSON.stringify(r.data));
r = await call('GET', `/api/reviews/product/${halo._id}`, null, { auth: false });
check('pending review hidden from public', r.status === 200 && !r.data?.reviews?.some((x) => x._id === reviewId));

// subscription
r = await call('POST', '/api/subscriptions', { items: [{ productId: halo._id, qty: 1 }], cadence: 'monthly' });
check('create subscription', r.status === 201 && r.data?.subscription?.status === 'active');
const subId = r.data?.subscription?._id;
r = await call('PUT', `/api/subscriptions/${subId}`, { status: 'paused' });
check('pause subscription', r.status === 200 && r.data?.subscription?.status === 'paused');

// wishlist + addresses + contact
r = await call('POST', `/api/auth/wishlist/${halo._id}`, {});
check('wishlist toggle', r.status === 200 && r.data?.wishlisted === true);
r = await call('POST', '/api/auth/addresses', { line1: '1 Test Way', city: 'Austin', zip: '78701' });
check('add address', r.status === 201 && r.data?.addresses?.length === 1);
const addrId = r.data?.addresses?.[0]?._id;
r = await call('DELETE', `/api/auth/addresses/${addrId}`, null);
check('delete address', r.status === 200 && r.data?.addresses?.length === 0);
r = await call('POST', '/api/contact', { name: 'Smoke', email, topic: 'Sizing', message: 'Which size?' }, { auth: false });
check('contact submit', r.status === 201);

// admin (login as seeded admin)
cookie = '';
r = await call('POST', '/api/auth/login', { email: 'admin@aurea.example', password: 'Admin123!' }, { auth: false });
check('admin login', r.status === 200 && r.data?.user?.role === 'admin', JSON.stringify(r.data)?.slice(0, 200));
r = await call('PUT', `/api/reviews/admin/${reviewId}`, { status: 'approved' });
check('admin approves review', r.status === 200 && r.data?.review?.status === 'approved');
r = await call('GET', `/api/reviews/product/${halo._id}`, null, { auth: false });
check('approved review now public', r.status === 200 && r.data?.reviews?.some((x) => x._id === reviewId));
r = await call('GET', '/api/admin/stats');
check('admin stats (revenue>0)', r.status === 200 && r.data?.stats?.revenue > 0, JSON.stringify(r.data?.stats));
r = await call('PUT', '/api/products/low-stock', null);
check('invalid id returns 400 (not 500)', r.status === 400, `status=${r.status}`);
r = await call('GET', '/api/products/low-stock');
check('low-stock list', r.status === 200 && Array.isArray(r.data?.products));
r = await call('GET', '/api/orders/admin/all');
check('admin orders paginated', r.status === 200 && r.data?.orders?.length >= 1 && r.data?.meta?.total >= 1);
r = await call('PUT', `/api/orders/admin/${orderId}`, { status: 'refunded' });
check('admin refunds order', r.status === 200 && r.data?.order?.status === 'refunded');
r = await call('GET', '/api/products/cloud-cleanser', null, { auth: false });
check('refund restocked inventory', r.data?.product?.stock === stockBefore, `before=${stockBefore} after=${r.data?.product?.stock}`);
r = await call('GET', '/api/contact');
check('admin messages', r.status === 200 && r.data?.messages?.length >= 1);

// webhook without stripe configured
r = await call('POST', '/api/orders/webhook', { type: 'x' }, { auth: false });
check('webhook 400 when stripe unconfigured', r.status === 400, `status=${r.status}`);

// negative: customer cannot hit admin
cookie = '';
await call('POST', '/api/auth/login', { email, password: 'Newpass123!' }, { auth: false });
r = await call('GET', '/api/admin/stats');
check('customer blocked from admin (403)', r.status === 403, `status=${r.status}`);

console.log(failures === 0 ? '[smoke] ALL PASS' : `[smoke] ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
