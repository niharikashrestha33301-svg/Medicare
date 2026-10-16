import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createServer, preview } from '../../frontend/node_modules/vite/dist/node/index.js';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';

const frontend = new URL('../../frontend/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const config = new URL('../../frontend/vite.config.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let dev, built;
try {
  dev = await createServer({ root: frontend, configFile: config, server: { host: '127.0.0.1', port: 5178, strictPort: true } });
  await dev.listen();
  built = await preview({ root: frontend, configFile: config, preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
  for (const origin of ['http://localhost:5000', 'http://127.0.0.1:5178', 'http://127.0.0.1:4178']) {
    for (const [page, marker, assets] of [
      ['test-bookings.html','My Test Bookings',['test-bookings.js','care.css','care-page.js','portal-api.js']],
      ['ambulance-provider.html','Provider dashboard',['ambulance-provider.js','care.css','care-page.js','portal-api.js']],
      ['consultations.html','Video Consultation',['consultations.js','care.css','care-page.js','portal-api.js']],
      ['pharmacy-product.html','Medicine Details',['pharmacy-product.js','pharmacy-catalogue.js','pharmacy.css','care.css','care-page.js','portal-api.js']],
      ['pharmacy-orders.html','Pharmacy Order History',['pharmacy.js','care.css','care-page.js','portal-api.js']],
      ['pharmacy.html','Online Pharmacy',['pharmacy.js','care.css','care-page.js','portal-api.js']],
      ['emergency.html', 'Emergency &amp;', ['emergency.js', 'emergency.css', 'portal-api.js']],
      ['health.html', 'Personal Health Dashboard', ['health-dashboard.js', 'health-connections.js', 'health-dashboard.css', 'portal-api.js']],
      ['medicines.html', 'Smart Medicine Reminder', ['medicines.js', 'medicines.css', 'medicine-sw.js', 'medicine.webmanifest', 'portal-api.js']]
    ]) {
      const response = await fetch(origin + '/' + page); assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(page === 'emergency.html' ? html.includes('Emergency & Nearby Hospitals') : html.includes(marker), `${origin}/${page} returned the wrong page`);
      for (const asset of assets) {
        const r = await fetch(origin + '/' + asset); assert.equal(r.status, 200); assert.ok(!r.headers.get('content-type').includes('text/html'), `${asset} fell back to the SPA`);
      }
    }
    const w = new JSDOM('<div></div>', { url: origin + '/health.html', runScripts: 'outside-only' }).window;
    w.AbortController = globalThis.AbortController;
    w.fetch = fetch;
    w.eval(fs.readFileSync(new URL('../../frontend/public/portal-api.js', import.meta.url), 'utf8'));
    assert.equal(w.MedicareAPI.base, origin + '/api');
    assert.equal((await w.MedicareAPI.request('/emergency/tracking')).tracking.available, false);
    await assert.rejects(w.MedicareAPI.request('/ambulance/account'), error => error.status === 401);
    await assert.rejects(w.MedicareAPI.request('/health-dashboard'), error => error.status === 401);
    await assert.rejects(w.MedicareAPI.request('/medicine-reminders'), error => error.status === 401);
    await assert.rejects(w.MedicareAPI.request('/consultations'), error => error.status === 401);
    await assert.rejects(w.MedicareAPI.request('/pharmacy/orders'), error => error.status === 401);
    w.close();
    console.log(`PASS: both feature pages, assets, API routing, and patient authentication on ${origin}`);
  }
  for (const page of ['pharmacy-product','pharmacy-orders','ambulance-provider','test-bookings','emergency', 'health', 'medicines','consultations','pharmacy']) {
    const wrapper = fs.readFileSync(new URL(`../../${page}.html`, import.meta.url), 'utf8');
    for (const origin of ['http://127.0.0.1:5500', 'file:///C:/Medicare']) {
      const href = `${origin}/${page}.html`; let target;
      vm.runInNewContext(wrapper.match(/<script>([\s\S]*?)<\/script>/)[1], { URL, location: { href, protocol: new URL(href).protocol, replace: value => { target = value; } }, document: { getElementById: () => ({}) } });
      assert.equal(target, origin.startsWith('file:') ? `http://localhost:5000/${page}.html` : `${origin}/frontend/public/${page}.html`);
    }
  }
  console.log('PASS: static-preview and file-open launchers resolve both buttons to real pages.');
  const allowed = await fetch('http://localhost:5000/api/emergency/tracking', { headers: { Origin: 'http://127.0.0.1:5500' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5500');
  const foreign = await fetch('http://localhost:5000/api/emergency/tracking', { headers: { Origin: 'https://unrelated.example' } });
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  console.log('PASS: the local static preview is allowed in development; unrelated origins are not.');
} finally {
  await dev?.close();
  if (built) await new Promise(resolve => built.httpServer.close(resolve));
}
