import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '../../frontend/node_modules/jsdom/lib/api.js';
import React from '../../frontend/node_modules/react/index.js';
import ReactDOM from '../../frontend/node_modules/react-dom/client.js';
import { transform } from '../../frontend/node_modules/esbuild/lib/main.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act } = React;
for (const [page, email, password, role] of [
  ['index.html', 'aayush.sharma@example.com', 'patient123', 'patient'],
  ['doctor.html', 'dr.yushika@medicare.com', 'doctor123', 'doctor'],
  ['patient.html', 'aayush.sharma@example.com', 'patient123', 'patient'],
  ['admin.html', 'admin@medicare.com', 'admin123', 'admin']
]) {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost:5000/${page}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.AbortSignal = globalThis.AbortSignal;
  window.AbortController = globalThis.AbortController;
  globalThis.window = window; globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  window.React = React;
  window.ReactDOM = { createRoot: (...args) => { window.testRoot = ReactDOM.createRoot(...args); return window.testRoot; } };
  window.fetch = (...args) => fetch(...args);
  window.lucide = { createIcons() {} };
  const pending = [];
  window.fetch = (...args) => { const promise = fetch(...args); pending.push(promise); return promise; };
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 8; i++) {
        await Promise.all(pending.splice(0));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    });
  };
  try {
    for (const file of ['currency.js', 'portal-api.js']) window.eval(fs.readFileSync(new URL(`../../frontend/public/${file}`, import.meta.url), 'utf8'));
    const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    const source = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
    await act(async () => window.eval((await transform(source, { loader: 'jsx' })).code));
    await settle();
    if (page === 'patient.html' || page === 'index.html') {
      const button = [...window.document.querySelectorAll('button')].find(button => /sign in/i.test(button.textContent));
      assert.ok(button); await act(async () => button.click());
    }
    const form = [...window.document.querySelectorAll('form')].find(form => form.querySelector('input[type="email"]') && form.querySelector('input[type="password"]'));
    assert.ok(form, `${page} login form missing`);
    form.querySelector('input[type="email"]').value = email;
    form.querySelector('input[type="password"]').value = 'wrong-password';
    await act(async () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    assert.equal(window.MedicareAPI.session(), null, `${page} accepted incorrect password`);
    form.querySelector('input[type="password"]').value = password;
    await act(async () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    assert.equal(window.MedicareAPI.session()?.user.role, role, `${page} did not sign in`);
    if (role === 'doctor') assert.ok(window.document.body.textContent.includes('Yushika Tumsawa Limbu'));
    assert.ok(!window.document.body.textContent.includes('Invalid email or password'));
    console.log(`PASS: ${page} rejects wrong password and signs in the ${role} through the live API.`);
  } finally {
    await act(async () => window.testRoot?.unmount()); window.close();
  }
}
