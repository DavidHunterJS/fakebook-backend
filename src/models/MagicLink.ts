// src/models/MagicToken.ts
import mongoose from 'mongoose';

const magicTokenSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  used: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const MagicToken = mongoose.model('MagicToken', magicTokenSchema);
export default MagicToken;