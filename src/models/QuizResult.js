import mongoose from 'mongoose';

const quizResultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    answers: {
      skinType: { type: String, enum: ['dry', 'oily', 'combo', 'sensitive'] },
      concern: { type: String, enum: ['dullness', 'breakouts', 'redness', 'aging', 'dark-spots'] },
      sensitivity: { type: String, enum: ['never', 'sometimes', 'often'] },
      routine: { type: String, enum: ['minimal', 'full'] },
    },
    recommended: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    heroProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    reasons: [{ type: String }],
  },
  { timestamps: true }
);

export const QuizResult = mongoose.model('QuizResult', quizResultSchema);
