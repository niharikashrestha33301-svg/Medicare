import { readFileSync, appendFileSync } from 'node:fs';
import webpush from 'web-push';
import pool from '../config/db.js';
import { ensureMedicineSchema } from '../services/medicineSchema.js';
try {
  await ensureMedicineSchema();
  const env = new URL('../.env', import.meta.url), contents = readFileSync(env, 'utf8');
  if (/^VAPID_PUBLIC_KEY=.+$/m.test(contents) !== /^VAPID_PRIVATE_KEY=.+$/m.test(contents)) throw new Error('An incomplete VAPID key pair exists. Configure the matching pair; existing keys were not changed.');
  if (!/^VAPID_PUBLIC_KEY=.+$/m.test(contents) && !/^VAPID_PRIVATE_KEY=.+$/m.test(contents)) {
    const keys = webpush.generateVAPIDKeys();
    appendFileSync(env, `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
    console.log('Private push keys saved in backend/.env. Existing keys were not rotated.');
  }
  if (!/^VAPID_SUBJECT=.+$/m.test(contents)) appendFileSync(env, '\nVAPID_SUBJECT=mailto:admin@localhost\n');
  console.log('Medicine tables are ready. Restart the API to load push settings. Configure a real VAPID contact before deployment.');
} finally { await pool.end(); }
