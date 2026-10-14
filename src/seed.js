import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Product } from './models/Product.js';
import { Coupon } from './models/Coupon.js';
import { User } from './models/User.js';

await connectDb();

const products = [
  {
    slug: 'cloud-cleanser',
    name: 'Cloud Cleanser',
    tagline: 'Amino + oat',
    description: 'A pH 5.5 gel cleanser that lifts sunscreen and city without stripping.',
    howToUse: 'Massage a coin-sized amount onto damp skin for 60 seconds, morning and night.',
    ingredients: 'Amino surfactants, oat extract, glycerin. Fragrance-free.',
    price: 34,
    images: ['https://images.unsplash.com/photo-1556228720-195a672e8a03?q=80&w=800&auto=format&fit=crop'],
    step: 'cleanse',
    stock: 120,
  },
  {
    slug: 'halo-serum',
    name: 'Halo Serum',
    tagline: '15% vitamin C',
    description: '3-O-ethyl vitamin C plus niacinamide for tone and glow, no sting.',
    howToUse: 'Press 3-4 drops onto dry skin after cleansing, AM only. Follow with moisturizer + SPF.',
    ingredients: '15% 3-O-ethyl ascorbic acid, niacinamide, hyaluronic acid. Fragrance-free.',
    price: 58,
    images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop'],
    step: 'treat',
    stock: 80,
  },
  {
    slug: 'dune-moisture',
    name: 'Dune Moisture',
    tagline: 'Ceramide + squalane',
    description: 'A barrier-first moisturizer that seals in treatment without pilling.',
    howToUse: 'Smooth a dime-sized amount over face and neck, AM and PM.',
    ingredients: 'Ceramides NP/AP/EOP, squalane, shea. Fragrance-free.',
    price: 46,
    images: ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=800&auto=format&fit=crop'],
    step: 'seal',
    stock: 100,
  },
];

for (const p of products) {
  await Product.findOneAndUpdate({ slug: p.slug }, p, { upsert: true, runValidators: true });
}
console.log('[seed] products upserted');

await Coupon.findOneAndUpdate(
  { code: 'WELCOME10' },
  { code: 'WELCOME10', type: 'percent', value: 10, minOrder: 0, active: true },
  { upsert: true }
);
console.log('[seed] coupon WELCOME10 ready');

const adminEmail = 'admin@aurea.example';
if (!(await User.findOne({ email: adminEmail }))) {
  const admin = new User({ name: 'Aurea Admin', email: adminEmail, role: 'admin', emailVerified: true });
  await admin.setPassword('Admin123!');
  await admin.save();
  console.log('[seed] admin created: admin@aurea.example / Admin123!');
} else {
  console.log('[seed] admin exists');
}

await mongoose.disconnect();
