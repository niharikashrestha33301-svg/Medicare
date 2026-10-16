import { mkdir, cp, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.vercel/output');
const site = path.join(output, 'static');
const rawOrigin = process.env.MEDICARE_API_ORIGIN?.trim();
let origin;
if (rawOrigin) {
  const url = new URL(rawOrigin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /^(localhost|127\.|\[::1\])/.test(url.hostname)) {
    throw new Error('MEDICARE_API_ORIGIN must be a public HTTPS backend origin, without credentials, path or query.');
  }
  origin = url.origin;
}
await mkdir(site, { recursive: true });
// The live Express homepage differs from the older Vite homepage. Preserve it.
await cp(path.join(root, 'frontend/public'), site, { recursive: true });
await cp(path.join(root, 'frontend/public'), path.join(site, 'frontend/public'), { recursive: true });
for (const page of ['index.html', 'admin.html', 'doctor.html', 'patient.html']) {
  await cp(path.join(root, page), path.join(site, page));
}
await access(path.join(site, 'images/dr-sowji-reddy.jpeg'));
const routes = [
  { src: '/api(?:/(.*))?', dest: origin ? `${origin}/api/$1` : '/api-unavailable.json', ...(origin ? {} : { status: 503 }), headers: { 'Cache-Control': 'no-store' } },
  { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, continue: true },
  { handle: 'filesystem' }
];
await writeFile(path.join(site, 'api-unavailable.json'), JSON.stringify({ success: false, message: 'The hosted MediCare backend is not connected yet. Configure MEDICARE_API_ORIGIN and redeploy.' }));
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2));
console.log(`Existing MediCare pages and assets built. API: ${origin || 'unconfigured (503; no simulated successes)'}`);
