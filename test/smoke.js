// MVP smoke test: exercises every route group against a live API.
// Usage: API=http://localhost:4000 node test/smoke.js  (API must be running, DB seeded)
const API = process.env.API || 'http://localhost:4000';
const email = `test${Date.now()}@example.com`;
let cookie = '';
let failures = 0;

async function call(method, path, body, { auth = true } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && cookie ? { Cookie: cookie } : {}),
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
r = await call('GET', '/api/products/halo-serum', null, { auth: false });
check('product detail', r.status === 200 && r.data?.product?.slug === 'halo-serum');
r = await call('GET', '/api/quiz/meta', null, { auth: false });
check('quiz meta', r.status === 200 && r.data?.options?.skinType?.length === 4);

// auth
r = await call('POST', '/api/auth/signup', { name: 'Smoke Test', email, password: 'Password123!' }, { auth: false });
check('signup 201', r.status === 201 && r.data?.user?.email === email, JSON.stringify(r.data)?.slice(0, 200));
const verifyToken = r.data?.devVerifyToken;
r = await call('POST', '/api/auth/verify', { email, token: verifyToken }, { auth: false });
check('verify email', r.status === 200);
r = await call('GET', '/api/auth/me');
check('me (cookie auth)', r.status === 200 && r.data?.user?.email === email, `status=${r.status}`);

// quiz
r = await call('POST', '/api/quiz/submit', {
  answers: { skinType: 'oily', concern: 'breakouts', sensitivity: 'sometimes', routine: 'minimal' },
  email,
});
check('quiz submit + hero', r.status === 201 && r.data?.result?.heroProduct, JSON.stringify(r.data)?.slice(0, 200));
const quizId = r.data?.result?._id;

// cart + coupon
r = await call('POST', '/api/cart/items', { slug: 'halo-serum', qty: 1 });
check('add to cart', r.status === 200 && r.data?.items?.length === 1, JSON.stringify(r.data)?.slice(0, 200));
r = await call('POST', '/api/cart/items', { slug: 'dune-moisture', qty: 2 });
check('add second item', r.status === 200 && r.data?.items?.length === 2);
r = await call('POST', '/api/coupons/validate', { code: 'WELCOME10' });
check('validate coupon', r.status === 200 && r.data?.coupon?.code === 'WELCOME10');
r = await call('POST', '/api/cart/coupon', { code: 'WELCOME10' });
check('apply coupon + discount>0', r.status === 200 && r.data?.totals?.discount > 0, JSON.stringify(r.data?.totals));

// checkout (dev mode, no Stripe key)
r = await call('POST', '/api/orders/checkout', {
  email,
  shippingAddress: { name: 'Smoke Test', line1: '1 Test Way', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
});
check('checkout 201 paid (dev)', r.status === 201 && r.data?.order?.status === 'paid', JSON.stringify(r.data)?.slice(0, 300));
const orderId = r.data?.order?._id;
r = await call('GET', '/api/orders');
check('order history', r.status === 200 && r.data?.orders?.length >= 1);

// review (verified purchase)
r = await call('POST', `/api/reviews/product/${halo._id}`, { rating: 5, title: 'Great', text: 'Smells like nothing, works great.' });
check('create verified review', r.status === 201 && r.data?.review?.verified === true, JSON.stringify(r.data)?.slice(0, 200));
r = await call('GET', `/api/reviews/product/${halo._id}`, null, { auth: false });
check('list reviews', r.status === 200 && r.data?.reviews?.length >= 1);

// subscription
r = await call('POST', '/api/subscriptions', { items: [{ productId: halo._id, qty: 1 }], cadence: 'monthly' });
check('create subscription', r.status === 201 && r.data?.subscription?.status === 'active');
const subId = r.data?.subscription?._id;
r = await call('PUT', `/api/subscriptions/${subId}`, { status: 'paused' });
check('pause subscription', r.status === 200 && r.data?.subscription?.status === 'paused');

// wishlist + contact (public)
r = await call('POST', `/api/auth/wishlist/${halo._id}`, {});
check('wishlist toggle', r.status === 200 && r.data?.wishlisted === true);
r = await call('POST', '/api/contact', { name: 'Smoke', email, topic: 'Sizing', message: 'Which size?' }, { auth: false });
check('contact submit', r.status === 201);

// admin (login as seeded admin)
cookie = '';
r = await call('POST', '/api/auth/login', { email: 'admin@aurea.example', password: 'Admin123!' }, { auth: false });
check('admin login', r.status === 200 && r.data?.user?.role === 'admin', JSON.stringify(r.data)?.slice(0, 200));
r = await call('GET', '/api/admin/stats');
check('admin stats (revenue>0)', r.status === 200 && r.data?.stats?.revenue > 0, JSON.stringify(r.data?.stats));
r = await call('PUT', '/api/products/low-stock', null);
check('invalid id returns 400 (not 500)', r.status === 400, `status=${r.status}`);
r = await call('GET', '/api/products/low-stock');
check('low-stock list', r.status === 200 && Array.isArray(r.data?.products));
r = await call('GET', '/api/orders/admin/all');
check('admin orders', r.status === 200 && r.data?.orders?.length >= 1);
r = await call('PUT', `/api/orders/admin/${orderId}`, { status: 'shipped', trackingNumber: 'TRACK123' });
check('admin ship order', r.status === 200 && r.data?.order?.status === 'shipped');
r = await call('GET', '/api/contact');
check('admin messages', r.status === 200 && r.data?.messages?.length >= 1);

// negative: customer cannot hit admin
cookie = '';
await call('POST', '/api/auth/login', { email, password: 'Password123!' }, { auth: false });
r = await call('GET', '/api/admin/stats');
check('customer blocked from admin (403)', r.status === 403, `status=${r.status}`);

console.log(failures === 0 ? '[smoke] ALL PASS' : `[smoke] ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
