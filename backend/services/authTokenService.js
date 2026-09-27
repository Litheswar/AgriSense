const jwt = require('jsonwebtoken');

const ISSUER = 'agrisense-api';
const AUDIENCE = 'agrisense-client';
const TOKEN_TTL = '1h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 || /[<>]/.test(secret)) {
    const error = new Error('Authentication is not configured.');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  return secret;
}

function issueToken(userId) {
  return jwt.sign({}, getSecret(), {
    algorithm: 'HS256',
    header: { typ: 'JWT' },
    subject: String(userId),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: TOKEN_TTL
  });
}

function assertConfigured() { getSecret(); }

function verifyToken(token) {
  const verified = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 0,
    complete: true
  });
  if (!verified || verified.header.typ !== 'JWT') throw new Error('Invalid token type.');
  const payload = verified.payload;
  if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string'
    || !/^[a-f\d]{24}$/i.test(payload.sub) || typeof payload.exp !== 'number'
    || typeof payload.iat !== 'number') {
    throw new Error('Invalid token claims.');
  }
  return { id: payload.sub };
}

module.exports = { issueToken, verifyToken, assertConfigured };
