import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';

const root = new URL('../../frontend/public/', import.meta.url);
const dom = new JSDOM(fs.readFileSync(new URL('health.html', root), 'utf8'), { url: 'http://localhost:5000/health.html', runScripts: 'outside-only' });
const w = dom.window;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
const state = { success: true, user: { name: 'UI Test Patient' }, records: [], readings: [], documents: [], appointments: [], doses: [] };
let session = null;
const calls = [];
w.MedicareAPI = {
  session: () => session,
  authenticate: async () => { session = { user: { role: 'patient' }, token: 'test-session' }; },
  request: async (path, options) => {
    calls.push({ path, options });
    if (options?.method === 'POST' && path.endsWith('/readings')) state.readings.push({ ...JSON.parse(options.body), id: 1, measured_at: JSON.parse(options.body).measuredAt, secondary_value: JSON.parse(options.body).secondaryValue });
    return structuredClone(state);
  }
};
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };
try {
  w.eval(fs.readFileSync(new URL('health-dashboard.js', root), 'utf8'));
  await settle();
  assert.equal(w.document.getElementById('auth').hidden, false);
  assert.equal(w.document.getElementById('dashboard').hidden, true);
  w.document.getElementById('login').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(w.document.getElementById('dashboard').hidden, false);
  assert.equal(w.document.querySelectorAll('.stat').length, 4);
  assert.ok(w.document.getElementById('chart').textContent.includes('No blood pressure measurements'));
  assert.ok(w.document.getElementById('document-list').textContent.includes('Keep your reports close'));
  w.document.querySelector('[data-open="reading"]').click();
  assert.equal(w.document.getElementById('editor').open, true);
  const form = w.document.getElementById('editor-form');
  form.elements.value.value = '120'; form.elements.secondaryValue.value = '80';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(w.document.getElementById('editor').open, false);
  assert.ok(w.document.querySelector('.chart-point'));
  assert.ok(w.document.getElementById('stats').textContent.includes('120/80'));
  w.document.querySelector('[data-metric="weight"]').click();
  assert.ok(w.document.getElementById('chart').textContent.includes('No weight measurements'));
  w.document.querySelector('[data-open="medication"]').click();
  assert.ok(form.elements.scheduleTime);
  w.document.getElementById('close-editor').click();
  state.records.push({ id: 3, category: 'history', title: '<img src=x onerror=alert(1)>', details: '<script>unsafe</script>', record_date: '2026-10-15' });
  w.dispatchEvent(new w.Event('focus')); await settle();
  assert.equal(w.document.querySelectorAll('#history-list img, #history-list script').length, 0);
  assert.ok(w.document.getElementById('history-list').textContent.includes('<script>unsafe</script>'));
  w.document.getElementById('signout').click(); session = null;
  assert.equal(w.document.getElementById('dashboard').hidden, true);
  assert.ok(calls.some(c => c.path.endsWith('/readings') && c.options?.method === 'POST'));
  console.log('PASS: signed-out gate, login, empty states, reading form/save, chart interaction, medication form, safe text rendering, and sign-out.');
} finally { w.close(); }
