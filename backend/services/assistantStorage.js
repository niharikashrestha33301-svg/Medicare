import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

function encryptionKey() {
  const key = process.env.ASSISTANT_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Encrypted history is not configured');
  return Buffer.from(key, 'hex');
}
export function historyAvailable() { try { encryptionKey(); return true; } catch { return false; } }
export function encryptHistory(value, userId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptHistory(value, userId) {
  const encrypted = Buffer.from(value);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), encrypted.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(userId)));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8'));
}
