import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { createECDH } from 'node:crypto';
export function pushSetup() {
  const missing = ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].filter(key => !process.env[key]);
  if (missing.length) return { configured:false, message:'Run npm.cmd --prefix backend run setup:medicine, then restart the Node API.', missing };
  try {
    const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY, 'base64url'));
    if (!key.getPublicKey().equals(Buffer.from(process.env.VAPID_PUBLIC_KEY, 'base64url'))) throw new Error('mismatch');
    const subject = new URL(process.env.VAPID_SUBJECT);
    if (!['mailto:','https:'].includes(subject.protocol) || !subject.pathname) throw new Error('subject');
    if (process.env.NODE_ENV === 'production' && process.env.VAPID_SUBJECT.includes('localhost')) throw new Error('development contact');
    return { configured:true, message:'Push keys are configured. Device delivery is not verified until a browser reports a display receipt.', missing:[] };
  } catch { return { configured:false, message:'Configure a matching VAPID key pair and a valid mailto: or HTTPS contact; restart the API. Existing keys were not changed.', missing:[] }; }
}
export function emailSetup() {
  const missing = ['SMTP_HOST','SMTP_FROM'].filter(key => !process.env[key]);
  const port = Number(process.env.SMTP_PORT || 587);
  if (process.env.SMTP_USER && !process.env.SMTP_PASSWORD) missing.push('SMTP_PASSWORD');
  if (missing.length || !Number.isInteger(port) || port < 1 || port > 65535) return {configured:false,missing,message:'Configure SMTP_HOST, SMTP_PORT, SMTP_FROM, and credentials if required. Restart the API, then verify your account email.'};
  return {configured:true,missing:[],message:'SMTP settings are present. Email delivery still requires working TLS credentials and patient email verification.'};
}
export const pushConfigured = () => pushSetup().configured;
export const emailConfigured = () => emailSetup().configured;
export function publicAppURL() {
  const url = new URL(process.env.APP_PUBLIC_URL || 'http://localhost:5000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('APP_PUBLIC_URL must use HTTPS in production');
  return url.origin;
}
function transport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
    requireTLS: port !== 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
}
export async function sendPush(subscription, payload) {
  if (!pushConfigured()) throw new Error('PUSH_NOT_CONFIGURED');
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 7200, urgency: 'high', timeout: 10000,
    vapidDetails: { subject: process.env.VAPID_SUBJECT, publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } });
}
export async function sendEmail(to, subject, text, key) {
  if (!emailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  const mail = transport();
  try { return await mail.sendMail({ from: process.env.SMTP_FROM, to, subject, text,
    messageId: key ? `<${key}@medicare-reminders.invalid>` : undefined, disableFileAccess: true, disableUrlAccess: true }); }
  finally { mail.close(); }
}
export function safeSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2500) return false;
  try {
    const url = new URL(value.endpoint), host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com');
    if (Buffer.from(value.keys?.p256dh || '', 'base64url').length !== 65 || Buffer.from(value.keys?.p256dh || '', 'base64url')[0] !== 4 || Buffer.from(value.keys?.auth || '', 'base64url').length !== 16) return false;
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443') && allowed &&
      typeof value.keys?.p256dh === 'string' && /^[A-Za-z0-9_-]{80,100}={0,2}$/.test(value.keys.p256dh) &&
      typeof value.keys?.auth === 'string' && /^[A-Za-z0-9_-]{20,30}={0,2}$/.test(value.keys.auth);
  } catch { return false; }
}
