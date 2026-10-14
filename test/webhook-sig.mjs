// Webhook signature test (no real Stripe calls; needs dummy keys on the API).
// Usage: PORT=4001 STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy \
//   node src/index.js &  API=http://localhost:4001 node test/webhook-sig.mjs
import Stripe from 'stripe';
const stripe = new Stripe('sk_test_dummy');
const API = process.env.API || 'http://localhost:4001';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';
let fails = 0;
const check = (n, c, x = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' ' + x}`); if (!c) fails++; };

const payload = JSON.stringify({
  id: 'evt_test', object: 'event', type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_test', object: 'payment_intent', metadata: { orderId: '000000000000000000000000' } } },
});
const goodSig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
let r = await fetch(`${API}/api/orders/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': goodSig }, body: payload });
check('valid signature accepted (200)', r.status === 200, `status=${r.status}`);
r = await fetch(`${API}/api/orders/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' }, body: payload });
check('forged signature rejected (401)', r.status === 401, `status=${r.status}`);
console.log(fails ? '[webhook] FAILURES' : '[webhook] ALL PASS');
process.exit(fails ? 1 : 0);
