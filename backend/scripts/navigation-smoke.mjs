import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';
import React from '../../frontend/node_modules/react/index.js';
import ReactDOM from '../../frontend/node_modules/react-dom/client.js';
import { transform } from '../../frontend/node_modules/esbuild/lib/main.js';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5000/', runScripts: 'outside-only' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { window } = dom;
const { act } = React;
window.React = React;
window.ReactDOM = { createRoot: (...args) => { window.testRoot = ReactDOM.createRoot(...args); return window.testRoot; } };
let iconScans = 0;
window.lucide = { createIcons: () => {
  iconScans++;
  for (const icon of window.document.querySelectorAll('i[data-lucide]')) {
    icon.replaceWith(window.document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  }
} };
window.eval(fs.readFileSync(new URL('../../frontend/public/currency.js', import.meta.url), 'utf8'));
const doctors = Array.from({ length: 1018 }, (_, i) => ({ id: i + 1, name: `Dr. Test ${i + 1}`, email: `test${i + 1}@example.invalid`, specialization: 'Psychiatry', hospital: 'Test Hospital', hospitalId: 1, consultationFee: 499, availableSlots: ['09:00 AM'], qualifications: 'MBBS', image: '/images/doctor-placeholder.svg' }));
window.fetch = async url => ({ json: async () => url.endsWith('/doctors') ? { success: true, doctors } : url.endsWith('/hospitals') ? { success: true, hospitals: [{ id: 1, name: 'Test Hospital' }] } : { success: true, appointments: [] } });
const source = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8').match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const compiled = await transform(source, { loader: 'jsx' });
const click = async text => {
  const button = [...window.document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  assert.ok(button, `Missing button: ${text}`);
  await act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
};
try {
  await act(async () => window.eval(compiled.code));
  const scansBefore = iconScans;
  await click('Find Doctors');
  assert.equal(window.document.querySelectorAll('img[alt^="Dr. Test"]').length, 24);
  assert.ok(iconScans - scansBefore < 5, 'Directory should not scan icons for every card');
  await click('Next');
  assert.ok(window.document.querySelector('img[alt="Dr. Test 25"]'));
  // Every paginated doctor can still open the booking form.
  const book = [...window.document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Book Appointment');
  assert.ok(book);
  await act(async () => book.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  assert.ok(window.document.querySelector('form'), 'Booking form should open');
  const close = window.document.querySelector('button.absolute');
  assert.ok(close, 'Booking close button should exist');
  await act(async () => close.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  await click('Appointments');
  assert.ok(window.document.body.textContent.includes('Sign In'), 'Appointment page should show sign-in for guests');
  await click('Find Doctors');
  assert.equal(window.document.querySelectorAll('img[alt^="Dr. Test"]').length, 24);
  console.log('PASS: Find Doctors, pagination, booking form open/close, Appointments, and return navigation with 1,018 doctors.');
} finally {
  await act(async () => window.testRoot?.unmount());
  window.close();
}
