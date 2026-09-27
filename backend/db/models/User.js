const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email is required']
  },
  passwordHash: { type: String, required: true, select: false }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } },
  toObject: { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
