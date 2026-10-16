import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';
import pool from '../config/db.js';

const dom = new JSDOM('<body><h1>Existing MediCare page</h1><script id="assistant-script" src="http://localhost:5000/frontend/public/medical-assistant.js"></script></body>', { url: 'http://localhost:5000/', runScripts: 'outside-only' });
const { window } = dom;
Object.defineProperty(window.document, 'currentScript', { value: window.document.querySelector('script'), configurable: true });
window.AbortSignal = AbortSignal;
const bookingIds = []; const savedIds = [];
window.fetch = async (...args) => {
  const response = await fetch(...args);
  if (String(args[0]).endsWith('/assistant/history') && args[1]?.method === 'POST' && response.ok) {
    savedIds.push((await response.clone().json()).id);
  }
  return response;
};
const userId = (await pool.query('SELECT id FROM users WHERE email = ?', ['aayush.sharma@example.com']))[0][0].id;
const waitFor = async (check, message) => {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > 6000) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); }
};
try {
  window.addEventListener('medicare:appointment-booked', event => bookingIds.push(event.detail.appointmentId));
  window.eval(fs.readFileSync(new URL('../../frontend/public/medical-assistant.js', import.meta.url), 'utf8'));
  const widget = window.document.querySelector('medicare-assistant'), root = widget.shadowRoot;
  await waitFor(() => widget.config.retentionDays === 30, 'Config did not load');
  assert.ok(window.document.querySelector('h1').textContent.includes('Existing MediCare'));
  root.querySelector('.launcher').click(); assert.equal(root.querySelector('.panel').hidden, false);
  const send = async text => {
    root.querySelector('textarea').value = text;
    root.querySelector('form.input-row').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => !widget.busy, 'Assistant response timed out');
    assert.equal(root.querySelector('.error').hidden, true, root.querySelector('.error').textContent);
  };
  await send('My skin is itchy'); assert.ok(root.querySelector('.messages').textContent.includes('When did this start'));
  await send('It started 3 days ago'); assert.ok(root.querySelector('.messages').textContent.includes('How severe'));
  await send('Mild, adult, no other symptoms'); assert.ok(root.querySelectorAll('.doctor').length > 0);
  root.querySelector('.book').click(); assert.ok(root.querySelector('#assistant-login-email'));
  root.querySelector('#assistant-login-email').value = 'aayush.sharma@example.com';
  root.querySelector('#assistant-login-password').value = 'patient123';
  root.querySelector('form.booking').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => root.querySelector('input[type="date"]'), 'Inline patient login did not open booking');
  const date = root.querySelector('input[type="date"]'); date.value = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
  date.dispatchEvent(new window.Event('change'));
  await waitFor(() => root.querySelector('form.booking .primary')?.disabled === false, 'Available slots did not load');
  root.querySelector('form.booking').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => bookingIds.length === 1, 'Appointment confirmation did not appear');
  assert.match(root.querySelector('.success').textContent, /₹499/);
  root.querySelector('.save').click();
  const consent = root.querySelector('.extras input[type="checkbox"]'); assert.equal(consent.checked, false);
  consent.checked = true; consent.dispatchEvent(new window.Event('change'));
  root.querySelector('.extras .primary').click();
  await waitFor(() => root.querySelector('.success')?.textContent.includes('Conversation saved'), 'Consent save did not complete');
  root.querySelector('.history').click(); await waitFor(() => root.querySelector('.saved'), 'Saved chats did not load');
  assert.ok(root.querySelector('.saved details'));
  root.querySelector('.reset').click(); await send('I cannot breathe');
  assert.ok(root.querySelector('.emergency')); assert.equal(root.querySelector('.send').disabled, true); assert.equal(root.querySelectorAll('.doctor').length, 0);
  root.querySelector('.close').click(); assert.equal(root.querySelector('.panel').hidden, true);
  assert.ok(window.document.querySelector('h1'));
  console.log('PASS: assistant UI opens, asks follow-ups, shows database doctors, signs in, books, saves with consent, reads history, and stops booking for emergencies.');
} finally {
  if (bookingIds.length) await pool.query('DELETE FROM appointments WHERE id IN (?)', [bookingIds]);
  // Delete only the chat created by this test, never pre-existing patient history.
  if (savedIds.length) await pool.query('DELETE FROM assistant_conversations WHERE id IN (?) AND user_id = ?', [savedIds, userId]);
  window.close(); await pool.end();
}
