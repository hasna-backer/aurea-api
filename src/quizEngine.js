import { Product } from './models/Product.js';

// MVP quiz engine: maps 4 answers onto the core trio.
// Everyone gets all three steps; hero product + reasons change by concern/type.
export async function recommendRoutine(answers) {
  const bySlug = Object.fromEntries(
    (await Product.find({ slug: { $in: ['cloud-cleanser', 'halo-serum', 'dune-moisture'] } })).map(
      (p) => [p.slug, p]
    )
  );
  if (!bySlug['cloud-cleanser']) throw new Error('Seed products missing - run npm run seed');

  const { skinType, concern, sensitivity } = answers;
  let hero = bySlug['halo-serum'];
  const reasons = [];

  if (concern === 'breakouts' || skinType === 'oily') {
    hero = bySlug['halo-serum'];
    reasons.push('Niacinamide in Halo helps balance oil and tone without clogging pores.');
  } else if (concern === 'redness' || sensitivity === 'often' || skinType === 'dry') {
    hero = bySlug['dune-moisture'];
    reasons.push('Ceramides + squalane in Dune support a reactive barrier with zero fragrance.');
  } else if (concern === 'aging' || concern === 'dark-spots' || concern === 'dullness') {
    hero = bySlug['halo-serum'];
    reasons.push('15% vitamin C targets dullness and uneven tone with daily use.');
  }
  if (sensitivity === 'often')
    reasons.push('All three steps are fragrance-free and patch-test friendly.');
  reasons.push('Cloud Cleanser keeps skin at pH 5.5 so treatments absorb better.');

  const order = [bySlug['cloud-cleanser']._id, hero._id];
  for (const p of Object.values(bySlug)) {
    if (!order.some((id) => id.equals(p._id))) order.push(p._id);
  }
  return { recommended: order, heroProduct: hero._id, reasons };
}

export const QUIZ_META = {
  skinType: ['dry', 'oily', 'combo', 'sensitive'],
  concern: ['dullness', 'breakouts', 'redness', 'aging', 'dark-spots'],
  sensitivity: ['never', 'sometimes', 'often'],
  routine: ['minimal', 'full'],
};
