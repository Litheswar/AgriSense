const User = require('../db/models/User');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { issueToken, assertConfigured } = require('../services/authTokenService');

const PASSWORD_MIN_LENGTH = 8;
function safeUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}
function authError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

exports.register = async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return authError(res, 400, 'INVALID_REGISTRATION', 'Provide a name, valid email, and password between 8 and 128 characters.');
  }
  try {
    assertConfigured();
    const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    const token = issueToken(user._id);
    return res.status(201).json({ success: true, user: safeUser(user), token });
  } catch (error) {
    if (error.code === 11000) return authError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'An account with that email already exists.');
    if (error.code === 'AUTH_NOT_CONFIGURED') return authError(res, 503, error.code, 'Authentication is temporarily unavailable.');
    if (error.name === 'ValidationError') return authError(res, 400, 'INVALID_REGISTRATION', 'Registration details are invalid.');
    return authError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
  }
};

exports.login = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || password.length > 128) {
    return authError(res, 400, 'INVALID_CREDENTIALS', 'Email and password are required.');
  }
  try {
    assertConfigured();
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = await verifyPassword(password, user && user.passwordHash);
    if (!user || !valid) return authError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    return res.status(200).json({ success: true, user: safeUser(user), token: issueToken(user._id) });
  } catch (error) {
    if (error.code === 'AUTH_NOT_CONFIGURED') return authError(res, 503, error.code, 'Authentication is temporarily unavailable.');
    return authError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
  }
};

exports.me = (req, res) => res.status(200).json({ success: true, user: req.user });
