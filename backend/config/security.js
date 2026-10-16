import './db.js';
export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || ['medicare_super_secret_jwt_key_2026', 'medicare_jwt_secret'].includes(secret)) throw new Error('Configure a private JWT_SECRET of at least 32 characters. Run npm run setup:database.');
  return secret;
}
