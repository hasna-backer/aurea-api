import { Router } from 'express';
import { QuizResult } from '../models/QuizResult.js';
import { asyncHandler } from '../middleware.js';
import { QUIZ_META, recommendRoutine } from '../quizEngine.js';

const router = Router();

router.get('/meta', (req, res) => res.json({ options: QUIZ_META }));

router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const { answers = {}, email } = req.body || {};
    for (const [key, values] of Object.entries(QUIZ_META)) {
      if (!values.includes(answers[key]))
        return res.status(400).json({ error: `Invalid answer for ${key}` });
    }
    const rec = await recommendRoutine(answers);
    const result = await QuizResult.create({
      user: req.user?._id,
      email: email || req.user?.email,
      answers,
      ...rec,
    });
    await result.populate('recommended heroProduct', 'slug name price images tagline');
    res.status(201).json({ result });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await QuizResult.findById(req.params.id).populate(
      'recommended heroProduct',
      'slug name price images tagline'
    );
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json({ result });
  })
);

export default router;
