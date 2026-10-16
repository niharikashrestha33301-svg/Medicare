import { randomBytes } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import pool from '../config/db.js';

await pool.query(`CREATE TABLE IF NOT EXISTS assistant_conversations (
  id CHAR(36) PRIMARY KEY, user_id INT NOT NULL, encrypted_payload MEDIUMBLOB NOT NULL,
  consent_version VARCHAR(40) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL, INDEX (user_id, created_at), INDEX (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB`);
const env = new URL('../.env', import.meta.url);
const contents = readFileSync(env, 'utf8');
if (!/^ASSISTANT_ENCRYPTION_KEY=.+$/m.test(contents)) appendFileSync(env, '\nASSISTANT_ENCRYPTION_KEY=' + randomBytes(32).toString('hex') + '\n');
await pool.query('DELETE FROM assistant_conversations WHERE expires_at <= NOW()');
await pool.end();
console.log('Assistant table and local encryption key are ready. Restart the API to load the key.');
