# Doctor approval and appointment booking

## Current database

MediCare uses the existing `medicare_db` MySQL/MariaDB database through the Express API. A live connection check on 15 October 2026 succeeded. No Supabase project is required for the current booking flow. Keep the existing database credentials in `backend/.env`; never publish that file. Existing doctor approvals and patient records were retained.

Start MySQL normally in XAMPP, run `npm.cmd start` in the project folder, and open `http://localhost:5000`. Saving files or reopening VS Code does not by itself guarantee that the API and database services are running. `/api/health` reports database connectivity.

## Review registrations

1. Open `http://localhost:5000/admin.html` and sign in with your administrator account.
2. Select **Manage Doctors**. Review the doctor's license, qualifications, specialization and hospital before making a decision.
3. Choose **Approve Doctor**, or enter a reason and choose **Reject Registration**. Previously approved doctors can have approval revoked with a reason.
4. The updated status appears after the API saves it. Concurrent stale reviews are rejected; refresh before retrying.

No existing doctor was automatically approved. Pending, rejected and revoked doctors cannot receive new bookings. Changing professional credentials returns the registration to pending review. Decisions are stored in `doctor_registration_reviews` and audited in `doctor_review_events`; both tables are additive. Review reasons are available only through the authenticated admin directory, not the public directory.

If you have no administrator account, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters) and optionally `BOOTSTRAP_ADMIN_NAME` in your local process environment. Run `npm.cmd --prefix backend run create:admin`. It creates a new account and refuses to overwrite an existing account. Clear those environment variables afterward. Public signup cannot create administrators.

## Book an appointment

Sign in as a patient, select a verified doctor with published slots, choose a future date and time, fill in the patient details and choose **Confirm Booking**. Success shows the booking reference and appointment details in your appointment list. Pending registrations have disabled booking controls. The server checks verification again, so an old page cannot book a doctor whose approval was revoked.

The API derives the patient identity from the authenticated account and the INR fee from the doctor's stored fee. Transactions lock the doctor row to prevent simultaneous reservations of the same date/time across API workers. Patients can view and cancel only their own appointments. Cancelled appointments release the slot. Reopening a booking checks verification, time and conflicts again.

## Verification

With MySQL and the API running:

```powershell
npm.cmd --prefix backend run test:doctor-approval
npm.cmd --prefix backend run test:booking-ui
npm.cmd --prefix backend run test:database
npm.cmd --prefix backend run test:care
npm.cmd run build
```

These tests use real MySQL/API operations with disposable accounts and remove only their own fixtures. UI clicks run in simulated DOMs, not a real browser. They do not verify live video calls.

## Optional Supabase later

Continue using MySQL now. If you decide to add Supabase later, follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to create the separate **medicare** project, configure server-only connection credentials and validate migrations before enabling the bridge. ChessPath, Rokdaos and Pastory must remain untouched. The optional bridge is not a replacement for a complete patient-authentication migration.
