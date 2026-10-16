# Smart Medicine Reminder

Open `/medicines.html` from the new **Medicine Reminder** navigation button or the health dashboard. Sign in with a patient account. Existing medication tracking and other MediCare features remain available; no existing medication or prescription record is replaced or automatically imported.

## Scheduling and tracking

- Add a medicine name, the exact prescribed dosage, optional instructions, 1–12 daily reminder times, a timezone, and start/end dates. The duration can span up to two years. Each medicine keeps its own timezone.
- Link a schedule to one of your own prescriptions from the health dashboard. Linking does not extract or change the prescription's dosage.
- Edit dates, times, timezone, instructions, and active status in the schedule editor. Dosage is read-only during editing until you explicitly confirm that you are entering updated prescribed instructions. No dosage is automatically calculated or modified.
- Future unrecorded occurrences are regenerated after edits. Earlier dose records retain their original medicine/dosage snapshots. Pausing a schedule cancels future pending occurrences while retaining history.
- The calendar shows the selected schedule-local date. Patients can mark a dose **Taken**, **Missed**, **Skipped**, or reset it. Future doses cannot be marked early. Unrecorded doses become Missed after a two-hour tracking grace period and can be corrected later. This status is a tracking label, not advice to take a late dose.
- New schedules begin at creation; earlier times on their first day are not invented as missed doses. The worker backfills up to 30 days of occurrences after an outage, bounded by the schedule's original creation time. It does not send stale medicine reminders more than two hours late.
- Enter current supply, supply units per dose, and a low-supply threshold. Supply units are inventory counts, not a calculated prescribed dosage. Taken reduces recorded supply once; repeated requests are idempotent. Changing Taken to another status restores the actual amount previously debited. Missed and Skipped do not reduce supply. Record refills explicitly.
- Adherence is Taken / all scheduled doses due in the last 30 days, excluding cancelled occurrences. Skipped, Missed, and overdue Pending doses are included in the denominator. Future doses are excluded. No doses due displays an empty progress state.
- The health dashboard includes reminder schedules, low-supply counts, adherence, and recent medication history from the same patient-owned database records.

## Browser notifications, including closed pages

1. Start MySQL and the API. From the project folder run:

   ```powershell
   npm.cmd --prefix backend run setup:medicine
   npm.cmd start
   ```

   Setup creates only additive tables and generates a private Web Push key pair in `backend/.env` if neither key exists. It never rotates an existing complete pair. Restart only the Node API after changing notification configuration; MySQL does not need restarting.

2. Open `http://localhost:5000/medicines.html`, sign in, and choose **Enable browser reminders**. Browser permission is requested only after this click. Use **Send test notification** to check your own device. Test acceptance by a push service does not prove that the browser displayed it.
3. For deployment, use HTTPS and an always-on backend. Set:

   ```dotenv
   APP_PUBLIC_URL=https://your-medicare-domain.example
   VAPID_SUBJECT=mailto:your-real-support-address@example.com
   MEDICINE_WORKER_ENABLED=true
   ```

   Retain the generated `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair privately. Setup uses `mailto:admin@localhost` for local development only; background push is treated as unconfigured if that development contact remains in production.

The server checks schedules every 30 seconds. MySQL stores occurrence and delivery jobs. A database advisory lock prevents multiple API instances from sending the same queued jobs concurrently. Jobs claim a lease, retry transient failures up to five times with backoff, discard expired subscriptions, and suppress duplicate event/channel/device jobs. Notification tags let the browser replace repeated deliveries for the same event. Like external email/push systems generally, a process crash after provider acceptance but before the database acknowledgement can still result in an at-least-once retry; delivery is not claimed to be exactly once.

The service worker receives Web Push without requiring the page to remain open on supported browsers. It never caches API responses, authenticated pages, or patient records. The lock-screen notification always uses generic text; medicine names, dosage, and prescription details are not included. A notification opens the reminder page, where authentication is still required.

Closed-page delivery depends on browser/OS support, internet availability, notification permissions, battery/background settings, and the server remaining online. Fully terminating a browser can prevent delivery on some devices. On supported iPhone/iPad versions, add the page to the Home Screen before enabling Web Push. This feature is not a guaranteed medical alarm. Browser/OS delivery cannot be validated by automated API tests; use the on-device test control.

Browser reminders continue after sign-out until **Disable on this device** is selected or browser permissions/subscriptions are removed. This is explicit in the UI. Avoid enabling them on shared devices. An explicit enable action associates the browser subscription with the current patient account. Invalidated devices can be enabled again from the reminder page.

References: [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [WebKit Home Screen Web Push](https://webkit.org/blog/13878/), [Web Push library](https://github.com/web-push-libs/web-push).

## Optional email reminders

Email support is prepared but disabled until an SMTP service is configured. No email provider or credentials were supplied for this project.

```dotenv
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=MediCare <reminders@your-verified-domain.example>
APP_PUBLIC_URL=https://your-medicare-domain.example
```

Port 465 uses implicit TLS; other SMTP ports require STARTTLS. Restart the API after setting credentials. The patient then selects **Verify email & enable reminders**. A single-use link, valid for 15 minutes, verifies their account email before reminder emails can be enabled. Verification requests are rate limited. Patients can disable email reminders independently of push. Emails are generic and sent only to the verified account address; requests cannot supply an arbitrary reminder recipient. SMTP credentials never reach the frontend.

Reference: [Nodemailer SMTP transport](https://nodemailer.com/smtp).

## Verify notification delivery on your device

Setup and permission buttons remain available when a service is unavailable: they open troubleshooting instructions rather than silently doing nothing. Browser permission is requested only when you select Enable browser reminders. Blocked permissions must be changed in the browser's site settings. Reconnect reminders if the server key has changed; keep existing VAPID keys stable.

Select **Test after closing page (60 seconds)**, then close every MediCare tab/window on that origin. Keep the Node API running and the device connected. After the scheduled test, reopen Medicine Reminder and inspect notification history and the device status. A provider acceptance alone is labeled display unverified. The service worker posts a short-lived, hashed-capability receipt only after `showNotification()` resolves, recording whether any site windows existed. A successful receipt with no windows is evidence of browser-reported closed-page display, not proof that a person saw a banner. Browser shutdown, OS restrictions, and offline devices can prevent delivery. Scheduling is checked every 30 seconds; this is not an exact-second alarm.

Actual closed-page delivery has **not** been verified in the development session: no browser was connected. Automated service-worker tests simulate display success/failure and window states; they are not real Web Push delivery tests. Real SMTP delivery is also unverified until credentials are configured and a patient verifies their email. No real push or email is sent by the integration suite.

The additive `medicine_delivery_receipts` table tracks browser acknowledgements and delayed device tests without storing plaintext receipt tokens. Disabling or expiring a device now preserves notification job history. Test deliveries, failed attempts, retry information, and browser receipts appear in the patient's private notification history. Refill alerts use recorded stock and the saved threshold; recording a refill removes the low-stock condition. No prescribed dosage is automatically changed.

## Data and security

The additive MySQL tables are `medicine_plans`, `medicine_events`, `medicine_preferences`, `medicine_push_subscriptions`, and `medicine_notification_jobs`. Patient authentication and role checks protect schedule, calendar, dose, supply, subscription, and preference APIs under `/api/medicine-reminders`. Every resource query uses the authenticated patient ID. Prescription ownership is checked server-side. Requests are rate limited, and push endpoints are limited to recognized HTTPS browser push services to prevent internal-network requests. Up to 10 reminder devices can be registered per patient.

Email verification stores only a token hash. The private Web Push key and SMTP credentials stay in `.env`, which is ignored by version control. API responses use `Cache-Control: no-store`. Health data is not put in browser persistent storage. Production still needs a restricted database user, HTTPS, protected environment secrets, backups, and appropriate medical-data controls as described in [DATABASE.md](DATABASE.md).

Compatible dependency security updates were applied. `npm audit --omit=dev` reported no runtime vulnerabilities during verification. The existing development-only nodemon/chokidar/braces chain still has advisories for which the audit tool proposes a breaking watcher downgrade; no forced downgrade or removal was made.

## Tests

```powershell
npm.cmd --prefix backend run test:medicine-unit
npm.cmd --prefix backend run test:medicine-ui
npm.cmd --prefix backend run test:medicine
npm.cmd run build
npm.cmd --prefix backend run test:routing
```

Integration tests use disposable patients and mock push/email transports. They verify schedule CRUD, patient and prescription ownership, immutable dosage history, dose idempotency, stock restoration/refills, future-dose validation, email token handling, subscription security, persistent jobs, duplicate suppression, delivery retries, and dashboard integration. They do not send real push notifications or emails. UI checks use jsdom, not a full visual browser. Unit checks cover timezone offsets/DST, encrypted VAPID request construction, generic service-worker notifications, safe notification destinations, and push endpoint validation. Existing authentication, booking, emergency, dashboard, and assistant suites remain available.
