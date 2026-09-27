const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = Buffer.from('agrisense-invalid-user-salt');
let dummyHashPromise;

async function derive(password, salt) {
  return scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, encodedHash) {
  let validFormat = typeof encodedHash === 'string';
  let salt = DUMMY_SALT;
  let expected;
  if (validFormat) {
    const parts = encodedHash.split('$');
    validFormat = parts.length === 6 && parts[0] === 'scrypt'
      && Number(parts[1]) === SCRYPT_OPTIONS.N && Number(parts[2]) === SCRYPT_OPTIONS.r
      && Number(parts[3]) === SCRYPT_OPTIONS.p && /^[a-f\d]{32}$/i.test(parts[4])
      && /^[a-f\d]{128}$/i.test(parts[5]);
    if (validFormat) {
      salt = Buffer.from(parts[4], 'hex');
      expected = Buffer.from(parts[5], 'hex');
    }
  }
  if (!expected) {
    dummyHashPromise ||= derive('not-a-real-user-password', DUMMY_SALT);
    expected = await dummyHashPromise;
  }
  const actual = await derive(typeof password === 'string' ? password : '', salt);
  return validFormat && actual.length === expected.length && timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
