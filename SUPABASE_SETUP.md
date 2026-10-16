# MediCare Supabase activation

## Current status

Doctor/patient/admin login is still the existing MediCare login; no passwords or records were migrated. The separate **medicare** project is still required. The server now prepares `GET /api/supabase-auth/status` and `GET /api/supabase-auth/session`. The session endpoint remotely validates a supplied native Supabase access token through Auth, then reads its active profile/role through the caller's RLS-scoped Data API. It rejects unverified email, missing/suspended profiles, mismatched projects and secret/service-role keys. The existing MySQL JWT is never silently replaced or matched to a Supabase identity by email. Native account provisioning, verified identity mapping, frontend session refresh and full cutover remain live-integration steps after the project is supplied.

Prepare these **server-only** environment values for that project:

```dotenv
SUPABASE_PROJECT_REF=your-medicare-project-ref
SUPABASE_URL=https://your-medicare-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_DB_URL=your-private-postgresql-connection-string
```

`SUPABASE_PUBLISHABLE_KEY` can also be a legacy anon key via `SUPABASE_ANON_KEY`. Do not use a service-role/secret key as the caller's Auth key. The session-check API is staged separately and is not a replacement for the original login endpoints until cutover is verified.

## India timezone correction

New bookings use `APPOINTMENT_TIMEZONE=Asia/Kolkata`. Their start instant is stored as UTC in additive `appointment_schedules`, in the same transaction as the booking. API responses include `startsAt` with a `Z` suffix and IST display values. The three existing bookings were captured using their prior Asia/Kathmandu setting; their original booking rows and actual instants were retained, and they now display converted Indian local times. The server uses these UTC snapshots for the exact 15-minute join window. Standard homepage/patient/React booking modals now load per-date slot availability through `/api/doctors/:id/availability?date=YYYY-MM-DD`, rather than repeating every published slot for every date. Past/booked options are disabled. Existing time formats such as `9:00 AM` and `09:00 AM` are compared consistently without rewriting records.

For an older installation, run `npm.cmd --prefix backend run setup:appointment-timezone -- --legacy-timezone=Asia/Kathmandu` **before** activating the new timezone, using the clinic's actual previous zone. The script adds missing UTC snapshots and changes only the appointment timezone setting. It never reseeds or rewrites the original bookings. Restart only the Node API afterward.

Doctors can explicitly choose **Complete appointment** on the consultation page. Completion and cancellation prevent further joining; completed appointments cannot be cancelled or reopened. Ending a call alone does not claim that a clinical visit was completed.

## Supabase project activation status

The consultation fixes work with the existing MySQL database. You chose to create the separate **medicare** Supabase project yourself. The new project ref and server database connection are still needed before connection/cutover. **ChessPath, Rokdaos and Pastory have not been modified.**

Two additive migrations and a server-side PostgreSQL adapter are prepared and tested in an isolated PostgreSQL engine. Those tests do not prove a live Supabase connection, Auth email delivery, or real video/audio. Keep `VIDEO_STORE=mysql` until the new project is configured and verified.

## Create the separate project

1. In the Supabase Dashboard, choose your intended organization, select **New project**, and name it **medicare**. Mumbai (`ap-south-1`) is the proposed region; confirm the displayed cost/plan before creation. If Codex creates it, Supabase requires an explicit organization choice and cost confirmation first.
2. Choose and retain a strong database password. Wait until the project is healthy.
3. Open that new project's **Connect** dialog and copy its direct PostgreSQL connection string, or **Session pooler** if this machine needs IPv4. Use the host and username shown by Supabase; do not construct a pooler hostname from the region.
4. Put the values in `backend/.env` (not frontend or Vite environment variables):

```dotenv
VIDEO_STORE=mysql
SUPABASE_PROJECT_REF=the-new-medicare-project-ref
SUPABASE_DB_URL=the-new-projects-postgresql-connection-string
# If your database requires a custom CA, provide its trusted PEM certificate as base64.
SUPABASE_DB_CA_BASE64=
```

The backend checks that the connection host/username matches the configured project ref and always verifies TLS certificates. It never sends the database password to the browser. URL-encode special characters in the database password. Connection details: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Apply and activate the consultation bridge

```powershell
npm.cmd --prefix backend run setup:supabase
```

This applies the versioned SQL migrations in a transaction, records their checksums and verifies RLS. It refuses missing/mismatched configuration. It does not delete or replace MySQL records. Use this migration runner consistently; do not independently reapply the same SQL through another migration system.

After successful connection/migration checks, change `VIDEO_STORE=supabase`, restart only the Node API, then sign in and refresh Video Consultation. A selected Supabase connection fails explicitly if unavailable; it does not silently save rooms to another database.

`medicare_video.*` stores consultation rooms and signaling in Supabase and mirrors minimal real doctor profiles, published slots, participant identities and appointments from MySQL. Existing MySQL bookings remain the booking authority across all original website pages, so two independent systems cannot sell the same slot. The bridge refreshes owned appointment status before room operations. Existing room IDs/history are imported without replacing cloud room state. Passwords, JWTs, medical notes and prescription contents are not mirrored by this bridge.

Only the Express server connects to this private schema. It validates the existing JWT against the live MySQL account and supplies transaction-local actor identity to a restricted PostgreSQL role. Row policies enforce patient/assigned-doctor access. The private schema must remain unexposed in the Data API. Database credentials are trusted server credentials; they are never patient credentials. Native Supabase `anon`/`authenticated` browser roles have no access to the bridge schema.

The Health Dashboard reads consultation history from the selected store. Other dashboard data and existing medicine, emergency and pharmacy features remain on MySQL. Switching the consultation store does **not** migrate every existing website feature or replace authentication.

## Supabase Auth and patient-data foundation

The second migration also prepares native Supabase Auth tables under the `medicare_` prefix: profiles, verified doctor directory, dated availability, appointments, consultation metadata, medical history/prescriptions, health readings, medicine plans/events, notification history and private medical-report metadata/storage.

New Supabase Auth signups receive a **patient** profile regardless of user-editable role metadata. Roles and doctor verification require trusted administrative provisioning. Native booking/cancellation RPCs enforce verified email, active patient accounts, real slot availability, server-controlled INR fees, unique active bookings and owner-only cancellation. Health records and reports use ownership policies; notification delivery history and room admission cannot be forged by browser writes. These policies have PostgreSQL tests, including role injection, duplicate booking, suspension, ownership reassignment and report-path access.

**This native Auth schema is a foundation, not an activated login/account migration.** Existing patients and doctors still use their current MediCare accounts. There is no automatic email-based account linking or copying of passwords. A full native Supabase Auth cutover, migration of existing records, native medicine-delivery worker integration, and verified signup/login/email flows still require a connected project and a tested account/data migration. The existing medicine reminder worker continues using MySQL; empty native reminder tables do not mean reminders have migrated.

In the new project's Auth settings, enable email confirmation, configure the real Site URL/allowed redirects, and configure SMTP before testing native signup/verification. Keep privileged keys server-side. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Real calls and validation

The current page supports dated availability, atomic booking/room creation, cancellation, appointment/history rendering, secure room links, waiting/admission, real WebRTC negotiation, microphone/camera controls, audio-only joining and permission errors. Links contain a random room ID, not an access token; opening one requires the booked patient or assigned doctor to sign in and click Join/Audio only. Camera/microphone access is never started by opening a link alone.

Audio Only calls `getUserMedia({audio:true, video:false})`; it does not request a camera and rejects incoming video when answering. A preview/admission is never labeled a connected media call. Future/expired/cancelled appointments return an explicit reason. Browser device permissions that remain unanswered time out with instructions; late-acquired tracks are stopped.

Reliable calls across different networks still need HTTPS and a real TURN relay (`WEBRTC_TURN_URLS`, `WEBRTC_TURN_SECRET`, described in [VIDEO_PHARMACY.md](VIDEO_PHARMACY.md)). No relay or video-provider credentials were supplied. No browser is connected in this session, so actual two-device audio/video remains **unverified**.

To finish live acceptance: use the booked patient and assigned doctor on two devices; test video and audio-only, doctor admission, two-way sound/video, mute/camera/leave/end, permission denial, private links, unrelated-account denial, future-room denial and cancellation. Repeat across different networks with TURN. Check both Supabase persistence/RLS and the existing website's appointment views. Run Supabase security/performance advisors on the new project before launch.

```powershell
npm.cmd --prefix backend run test:care
npm.cmd --prefix backend run test:care-ui
npm.cmd --prefix backend run test:video-postgres
npm.cmd --prefix backend run test:supabase-security
npm.cmd run build
npm.cmd --prefix backend run test:routing
```

`test:care` uses an isolated local API and disposable MySQL fixtures. PostgreSQL tests execute the actual migrations/policies locally. UI/media tests use jsdom and mocked browser APIs. They are not proof of a live Supabase Auth service, real camera call, successful TURN traversal or production readiness.
