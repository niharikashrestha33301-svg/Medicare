# MediCare database setup and development

## Existing stack

The active application uses MySQL/MariaDB through `mysql2/promise`, Express, bcrypt password hashing, and JWT bearer authentication. The frontend includes a Vite/React application and standalone React pages (`index.html`, `patient.html`, `doctor.html`, `admin.html`). Both use the same API. Files under `backend/models` are older Mongoose models; they are retained for compatibility but are not imported by the running MySQL API. MongoDB is not required.

The existing local database is `medicare_db`, served by XAMPP MySQL. Its records were retained. Do not run `seed.js` to connect an existing database: seeding is separate from setup and may reset data.

## Start locally

1. Start MySQL in XAMPP. No service restart or force-stop is needed for normal setup.
2. Confirm `backend/.env` contains your database settings:

   ```dotenv
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=medicare_db
   PORT=5000
   APP_TIMEZONE=Asia/Kathmandu
   ```

   The existing local connection already works. If you use another database, supply its host, port, database name, username, and password here. Use a private application database user instead of the XAMPP root account for deployment.

3. From the project folder, run:

   ```powershell
   npm.cmd --prefix backend run setup:database
   npm.cmd start
   ```

   Setup creates only missing tables, the optional patient age column, and a booking lookup index. It does not seed, drop, truncate, or replace existing records. It generates a private `JWT_SECRET` if the configured key is missing or is the shared example. Restart the Node API after changing environment variables; a changed secret requires users to sign in again.

4. Open `http://localhost:5000`. The personal dashboard is at `http://localhost:5000/health.html`.
5. Optional React development: `npm.cmd --prefix frontend run dev`. Keep the backend on port 5000. Add your exact frontend origin to `CORS_ORIGINS` if using a different host or port.

`Start-Medicare.cmd` and the VS Code folder-open task remain available. They start services when absent; they do not repair or forcibly restart MySQL. If database startup fails, inspect XAMPP's log rather than reseeding or deleting database files.

## Authentication and permissions

- Patients and doctors register through `/api/auth/register`. Passwords are hashed; duplicate email/license constraints are enforced. User and doctor creation is transactional, so a failed doctor profile cannot leave an orphan login.
- New doctor credentials await admin verification before bookings are accepted. Changing professional credentials requires verification again. Existing verified doctors retain their status.
- Public admin signup is blocked. An authenticated admin can create accounts with `POST /api/admin/users`. To bootstrap an admin locally, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters), and optionally `BOOTSTRAP_ADMIN_NAME` in your process environment, then run `npm.cmd --prefix backend run create:admin`. This creates a new account only; it never overwrites an existing password or role. Remove bootstrap credentials from the environment afterward.
- JWTs expire after 12 hours. Sign-in and registration requests are rate limited. A suspended account cannot use an existing token.
- Patient medical data and appointment reads use the authenticated user ID, never a user ID or email supplied in the request body. Legacy unlinked bookings are preserved but are not automatically claimed by matching an email address.
- Doctors see and update only appointments assigned to them, and manage only their own profile and slots. Admins manage the directory, users, hospitals, and bookings. The admin interface does not receive patient medical documents through the patient-only health API.
- Update your own patient profile through `PUT /api/auth/me`; age, date of birth, contact details, gender, and blood group are validated. Role and email cannot be changed through this endpoint.

## Data and API connections

| Feature | API | Storage and behavior |
| --- | --- | --- |
| Account/profile | `/api/auth/register`, `/login`, `/me` | `users`, hashed passwords, owner profile updates |
| Doctor directory/profile | `/api/doctors`, `/:id` | `doctors`, `users`, `hospitals`; INR fees determined by the server |
| Availability | `/api/doctors/:id/slots` | Owner-only add/remove; duplicate slots rejected |
| Bookings | `/api/appointments`, `/my`, `/:id/status`, `/:id/cancel` | Real bookings; doctor row locks serialize conflicting requests; cancellation releases a slot |
| History, prescriptions, medication | `/api/health-dashboard/records` | `patient_health_records`; patient-entered records are labelled as such |
| Health trends | `/api/health-dashboard/readings` | `patient_health_readings`; blood pressure, heart rate, weight, blood sugar |
| Medication check-ins | `/api/health-dashboard/medications/:id/dose` | `patient_medication_doses`; unique daily check-in; reversible |
| Reports | `/api/health-dashboard/documents` and `/:id` | Private MySQL blobs; PDF/PNG/JPEG signature checks; 2 MB maximum; authenticated downloads |
| Hospitals/emergency | `/api/hospitals`, `/api/emergency` | Stored hospital emergency contacts; tracking unavailable until a provider is integrated |

All API health reads require authentication and patient role. Health record updates/deletes and report retrieval check ownership in the SQL statement. Documents are served as downloads with `nosniff`, never exposed as public file paths. The dashboard starts with empty states rather than fabricated health records. Reminders are displayed in the open dashboard; no background SMS/email/push service is configured.

The standalone patient, doctor, and admin actions now persist through APIs instead of modifying browser-only appointment/user lists. The React application's booking, cancellation, status, and availability actions also persist. Historical browser demo data is left untouched but is not used as live patient or admin records.

## Emergency provider integration

No authorized ambulance-tracking provider or credentials have been supplied. `/api/emergency` returns `tracking.available: false` and no vehicle locations. The patient emergency panel displays hospital contacts from MySQL, without invented ambulance positions or dispatch estimates. To connect tracking, provide the provider name, API documentation, access scope, and server-side credentials through environment variables; do not place a provider token in frontend code.

## Tests

With MySQL and the API running:

```powershell
npm.cmd --prefix backend run test:database
npm.cmd --prefix backend run test:health
node backend/scripts/auth-smoke.js
node backend/scripts/portal-signin-smoke.mjs
node backend/scripts/health-dashboard-ui-test.mjs
npm.cmd --prefix backend run test:assistant
npm.cmd run build
```

Database tests create disposable accounts/bookings and remove only their own fixtures. They cover registration/login, password hashing, roles, profile persistence, doctor slot ownership, INR fees, simultaneous booking conflicts, cancellation/status ownership, suspension, private record CRUD, and private report downloads. UI tests use jsdom, not a full visual browser. Existing demo sign-in checks use the development accounts documented in README; change or disable those credentials before public deployment.

This is a connected development setup. Public deployment additionally requires HTTPS, a private restricted database user, protected environment secrets, database encryption/backups appropriate to medical records, a deployment-specific CORS allowlist, and an audit/retention policy. The project does not claim regulatory certification.
