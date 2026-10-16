# 🏥 Medicare+ Healthcare System

## Run the app and sign in

### Saved lab test requests

Sign in as a patient, choose **Book Tests**, complete the collection form, then confirm. Requests now persist in the existing MySQL database (`patient_lab_bookings`). Choose **My Test Bookings** in the navigation, or open `http://localhost:5000/test-bookings.html`, to view references, dates, prices, collection preferences and cancellation status after reloading or signing in again. Patients can access and cancel only their own requests. Duplicate active requests for the same test, date and preference are rejected. Fees and account identity come from the server, not the submitted form.

The status is **Requested**, not a confirmed lab appointment. No lab provider, dispatch, payment or automated report delivery is connected. Earlier popup-only bookings were never saved and cannot be recovered. No existing data was reset. The table is created additively on first use. Run `npm.cmd --prefix backend run test:lab-booking` for real database/API tests with disposable accounts and simulated UI clicks.

See [DOCTOR_APPROVAL.md](DOCTOR_APPROVAL.md) for administrator review, secure booking, and the current database connection.

See [DATABASE.md](DATABASE.md) for the active MySQL setup, secure API permissions, tests, administrator creation, and ambulance-provider requirements. Connect an existing database with `npm.cmd --prefix backend run setup:database`; do not reseed it.

See [EMERGENCY.md](EMERGENCY.md) for permission-based GPS, nearby-hospital searches and routes in Google Maps, 112/108 dial links, and the future authorized ambulance-provider interface. Open `/emergency.html`; no Google API key is needed for the current Maps links.

See [MEDICINE_REMINDERS.md](MEDICINE_REMINDERS.md) for Smart Medicine Reminder schedules, refill alerts, private adherence history, opt-in background Web Push, and optional verified-email reminders. Open `/medicines.html`. Run `npm.cmd --prefix backend run setup:medicine` once to prepare push keys and additive tables.

### Personal health dashboard

The dashboard also brings together your saved profile, lab-test requests, medicine schedules and daily dose states, and pharmacy orders. Open the connected service to edit schedules, refill supplies, cancel test requests or manage orders. Quick links cover emergency help, consultations and report uploads. These sections use the existing authenticated APIs, show explicit empty/error states, clear on sign-out and do not change prescriptions or create sample records. An unavailable pharmacy or lab API does not hide the other sections. Run `npm.cmd --prefix backend run test:health-connections` to check real database-backed rendering and patient isolation using disposable fixtures and simulated UI.

Open `/health.html` or choose **Health Dashboard** from the main site or patient portal. Sign in with an existing patient account. The dashboard shows real appointments linked to that patient's user ID, with no sample health records. Patients can log readings, add history and prescription details, track one daily medication check-in, and upload/download private PDF, PNG, and JPEG documents (2 MB maximum). Reminders appear in the dashboard while it is open; no background push, email, or SMS is sent. Records entered by patients are labelled accordingly.

The API creates four additive `patient_health_*` / `patient_medication_doses` tables on first authenticated use. No seed or database reset is required. All health queries use the authenticated user ID, and all document downloads require a bearer token. Uploaded documents are stored in MySQL, never in a public upload folder. Existing appointment mutation endpoints also check ownership or the treating doctor/admin role.

Run `npm.cmd --prefix backend run test:health` with the API and MySQL running. The integration test creates two temporary patient accounts, exercises persistence and cross-patient access denial, checks UI rendering and chart interaction, then deletes its own fixtures. Health records contain sensitive data: configure a private database, production JWT secret, HTTPS, and appropriate database backups before public deployment.

Opening this folder in VS Code runs the **Start Medicare (API + MySQL)** task. The first time, allow automatic tasks when VS Code asks (or use **Tasks: Manage Automatic Tasks in Folder** from the Command Palette and choose **Allow Automatic Tasks**). Use a trusted workspace. The task starts MySQL if needed, starts the API, and opens http://localhost:5000. Saving files does not start these services.

You can also double-click `Start-Medicare.cmd` without opening VS Code. If startup fails, the launcher keeps the error visible.

The new symptom assistant is documented in [ASSISTANT.md](ASSISTANT.md), including setup, optional AI configuration, privacy controls, and safety limits.

From the project folder, run `npm start` and keep that terminal open. Open http://localhost:5000. The API must keep running for sign-in and the full doctor directory.
On Windows, `powershell -ExecutionPolicy Bypass -File .\Start-Medicare.ps1` also starts XAMPP MySQL when needed.
Doctor demo accounts use `doctor123`, for example `dr.yushika@medicare.com`, `dr.vidya@medicare.com`, `dr.akaash@medicare.com`, `dr.omkar@medicare.com`, `dr.bijoy@medicare.com`, and `dr.radhe@medicare.com`.

For the existing database, start MySQL in XAMPP, then run `npm.cmd start` from the project folder. Do not seed or reset an existing database.
Open http://localhost:5000 for the main app. Use **Join** to create a patient or doctor account, or **Sign In** for an existing account.

Demo patient: `aayush.sharma@example.com` / `patient123`.
Demo doctor: `dr.sanjeev@medicare.com` / `doctor123`.
Demo admin: `admin@medicare.com` / `admin123`.

For the React frontend, run `npm install` and `npm run dev` from `frontend`, then open http://localhost:5173. Keep the backend running on port 5000.
Run `node scripts/auth-smoke.js` from `backend` to verify signup, login, validation, and authenticated profile access. The check removes its temporary test account.

Modern, full-stack Hospital OPD & Doctor Appointment Booking platform with **MySQL Database**, **Express Backend**, and **React & Tailwind CSS Frontend**.

---

## 🌟 Visual Preview & Features

### 1. 🖥️ Landing Page (`index.html`)
- **Header**: Navigation pills (`[ ♥ DASHBOARD ]`, `[ 📅 APPOINTMENTS ]`, `[ 👤 MY PATIENTS / DOCTORS ]`, `[ 🚑 EMERGENCY ]`, `[ 💬 HOSPITALS ]`), `SIGN IN` link, and `JOIN` button.
- **Hero**:
  - Pill badge: `● ALWAYS HERE FOR YOU`
  - Headline: `YOUR HEALTH IS OUR PRIORITY`
  - Actions: `[ BOOK APPOINTMENT ]` and `[ 🚑 EMERGENCY HELP ]`
  - Live counters: `24/7 Availability`, `10k+ Happy Patients`, `4.9/5 Avg Rating`
  - Doctor Care image with floating overlay card: `🛡️ Verified Doctors - Every specialist is hand-picked`
- **Specialties Grid**: Cardiology, Nephrology, Dermatology, Pediatrics, Orthopedics, Psychiatry, General Medicine.

---

### 2. 🔐 Split-Screen Register & Login (`Join / Sign In`)
- **Left Hero Column (Vibrant Royal Blue)**:
  - Heading: `Join our healthcare community today.`
  - Badges: `👤 Direct access to Specialists`, `🛡️ Secure Health Records`, `📅 Easy Online Booking`.
- **Right Form Column**:
  - Role switcher: `[ As Patient ]` vs `[ As Doctor ]`
  - **Patient Fields**: First Name, Last Name, Email Address, Phone Number, Date of Birth, Gender, Password, Confirm Password.
  - **Doctor Fields**: Practice Hospital / Clinic dropdown, Specialty dropdown, License Number (NMC / Registration No.), Experience (Years), Consultation Fee ($), Password, Confirm Password.

---

## 🗄️ MySQL Database Setup

### 1. Database Schema & Tables (`backend/schema.sql`)
1. `users` (id, name, email, password, phone, role, status, dob, gender, blood_group)
2. `hospitals` (id, name, city, address, phone, emergency, beds, image)
3. `hospital_departments` (id, hospital_id, department_name)
4. `doctors` (id, user_id, specialization, license_no, qualifications, experience, consultation_fee, hospital_id, about, verified, image)
5. `doctor_slots` (id, doctor_id, slot_time)
6. `appointments` (id, appointment_code, patient_id, doctor_id, hospital_id, patient_name, patient_email, patient_phone, patient_age, patient_gender, appointment_date, time_slot, symptoms, status, fee, cancel_reason)

---

### 2. Quick MySQL Setup & Seed
1. Start your local MySQL Server (via **XAMPP**, **WampServer**, **Laragon**, or **MySQL Workbench**).
2. Run database migration and seed script:
```bash
cd backend
npm install
npm run seed
```
3. Start the backend API:
```bash
npm run dev
```

---

## 🌐 Instant Live Web Preview

Open in any browser:
- **Landing & Patient Portal**: `http://localhost:5173/index.html` (or `patient.html`)
- **Doctor Practice Hub**: `http://localhost:5173/doctor.html`
- **Admin Control Center**: `http://localhost:5173/admin.html`
# Video consultations and pharmacy

The navigation now includes Video Consultation and Online Pharmacy. See [VIDEO_PHARMACY.md](VIDEO_PHARMACY.md) for database setup, operator inventory and prescription verification, TURN relay configuration, optional Razorpay integration, tests, and live verification requirements. These features do not seed inventory or simulate calls, payments, or courier locations.

