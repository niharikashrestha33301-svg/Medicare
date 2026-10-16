# Video consultations and online pharmacy

Consultation repairs and the separate Supabase activation path are documented in [SUPABASE_SETUP.md](SUPABASE_SETUP.md). MySQL remains active until the new MediCare project and its server connection are configured. The Supabase migration has not been deployed to any unrelated project.

Open **Video Consultation** or **Online Pharmacy** in the existing navigation. The original pages, authentication, appointments, records, reminders and emergency features remain available. Both new pages use the existing Express/MySQL APIs and account sessions; no external SDK account is needed for the WebRTC implementation.

## Local setup

```powershell
npm.cmd --prefix backend run setup:care
npm.cmd start
```

The migration adds tables and preserves existing records. No medicine catalogue, stock, courier updates, payment credentials or demo rooms are seeded. The new pages work through the API on port 5000, Vite dev/preview proxies, and the existing static-preview launchers. Prefer `http://localhost:5000` for local camera access; production camera/microphone access requires HTTPS.

## Video consultations

Patients can schedule against existing verified doctors and published slots, or create a video room for an active appointment. Existing slot conflict protection and doctor fees in ₹ apply. Booking does not collect a consultation fee or mark it paid. Only the booked patient and assigned doctor may enter a room; administrators cannot join calls. Room IDs alone confer no access. One active device per participant is allowed, with a short heartbeat lease so abandoned devices can be replaced. The treating doctor admits the patient from the waiting room and can end the room. Patients can leave and rejoin while the appointment is active.

Appointment times use `APPOINTMENT_TIMEZONE`, falling back to the existing `APP_TIMEZONE` (`Asia/Kathmandu` by default). Configure the clinic's actual timezone consistently; for India this may be `Asia/Kolkata`. Room access opens 15 minutes before the booking and closes two hours after its scheduled start. Doctor verification, both account statuses, appointment ownership/status, device sessions, admission and negotiation generation are checked server-side. Cancelled or completed appointments cannot be joined.

Camera preview, microphone mute, camera toggle, audio-only joining, speaker playback, leaving and doctor termination are implemented. The interface says **Connected** only when `RTCPeerConnection.connectionState` reports `connected`. Room admission history appears in the Health Dashboard; it does not claim that a call successfully connected. No recording or medical transcript is created. WebRTC encrypts media; authenticated signaling is carried over the same API, and its temporary SDP/ICE records expire after five minutes. Use HTTPS for signaling in deployment.

For reliable calling across different networks, provide a real coturn-compatible TURN relay:

```dotenv
APPOINTMENT_TIMEZONE=Asia/Kolkata
WEBRTC_TURN_URLS=turns:your-relay.example:5349,turn:your-relay.example:3478
WEBRTC_TURN_SECRET=your-coturn-static-auth-secret
```

The backend issues two-hour, user-specific TURN REST credentials, not the relay secret. The service must support coturn REST shared-secret authentication; an unrelated provider API key or static password cannot be substituted for that secret. When configured, calls use relay-only ICE to avoid direct peer address disclosure. Without TURN, direct calls use the default `stun:stun.l.google.com:19302` discovery server. STUN helps discover direct connections but does not relay media or guarantee connectivity on restrictive networks. Public STUN sees the connecting network address; configure `WEBRTC_STUN_URLS` to your own STUN service, or set it to an empty value to disable discovery. No public TURN relay is substituted. Relay credentials, bandwidth, DNS, certificates and firewall configuration must come from the deployment operator.

After putting your TURN values in `backend/.env`, run `npm.cmd --prefix backend run check:video`, then restart only the Node API. The check reports configuration and database readiness without printing credentials; it does not prove relay reachability. Do not restart or force-stop MySQL. Open Video Consultation and check that the setup panel reports the private relay is configured.

For users: sign in as the patient and book a verified doctor with published slots. All original doctors remain visible, with unbookable options disabled. The booked patient and assigned doctor sign in separately and open Video Consultation at the scheduled time. **Join room** requests camera and microphone; **Audio only** requests only the microphone. The doctor selects **Admit patient** after both enter. Devices need a supported browser and HTTPS or localhost. Future/past-room controls remain disabled with the opening-window reason visible; refresh appointments when the room opens. Streamless incoming audio and video now combine in one remote stream, so video does not replace the other participant's audio.

**Real video/audio has not been verified in this development session:** no browser is connected. API signaling tests and simulated media tests are not proof of a working call. To verify: use separate patient and treating-doctor accounts on two devices, book a current slot, join both rooms, admit the patient, confirm actual two-way audio/video, test mute/camera/audio-only/leave/rejoin/end, then repeat across different networks with TURN. Also test denied device permission and an unrelated patient's denied access.

WebRTC references: [MDN signaling and calling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling), [RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection).

## Pharmacy inventory, prescriptions and delivery

Sign in to the pharmacy with an existing admin account to manage actual inventory. Products have SKU, category, manufacturer, pack size, details, prescription requirement, available stock, active status and integer paise prices. Inventory edits use a revision check so an old form cannot overwrite stock consumed by a new order. There is no automatic third-party inventory supplier; enter verified stock through the operator page/API. Search, categories, medicine details and empty states use database records only.

Before accepting orders, configure:

```dotenv
PHARMACY_ENABLED=true
# Enable only if the pharmacy actually offers cash on delivery.
PHARMACY_COD_ENABLED=true
# Admin user IDs belonging to authorized pharmacists. This is not self-service registration.
PHARMACY_REVIEWER_IDS=your-authorized-pharmacist-admin-user-id
```

Ordering remains unavailable until enabled and at least one payment method is configured. No credentials or provider accounts were supplied, so these settings have not been enabled automatically. Admins can maintain inventory and fulfillment, but cannot view original prescriptions or approve them unless explicitly assigned in `PHARMACY_REVIEWER_IDS`. This capability uses the project's existing admin role; a separate pharmacist identity provider/licensing service is not integrated. Use a protected admin account provisioned for the actual authorized pharmacist.

Patients have private persistent carts. Checkout rechecks stock and prices inside a transaction, locks products in order, reserves stock and uses a patient-scoped idempotency key. User-supplied prices and patient IDs are ignored. Prescription medicines require an owned PDF/JPEG/PNG document (maximum 2 MB) and an explicit pharmacist decision; a patient-entered text prescription is not treated as verified. Uploads use the existing private medical-document API. Orders keep a private document snapshot so later removal from the patient's dashboard cannot silently change a pending verification. Downloads require the owning patient or an authorized reviewer. File previews are not embedded.

Approval permits payment/fulfillment; rejection restores reserved stock once. Unpaid/unreviewed reservations without a gateway operation expire after 24 hours, with a recorded event and stock restoration. Confirmed orders progress through Packing → Dispatched → Delivered. Dispatch requires actual carrier and tracking information; delivery of COD orders requires the operator to confirm actual collection. The timeline contains operator-entered facts, not simulated courier locations or ETA. Live courier tracking is unavailable until an authorized provider is connected. The customer can refresh order updates; there is no live location map.

Automatic cancellation is allowed only before fulfillment and before a gateway operation/capture. Orders with a payment operation require operator reconciliation; paid orders require an actual refund process before cancellation. Automatic refunds are not implemented or represented as completed. A failed/ambiguous gateway order-creation request intentionally leaves a reconciliation guard to prevent duplicate charges; resolve it with the provider before clearing `payment_lease` or cancelling through an audited operational process. The supplied order total includes medicine prices only; shipping charges and tax calculation are not integrated.

## Optional online payments

Razorpay order creation, Standard Checkout, server-side HMAC verification, captured-payment retrieval and a signed raw-body `payment.captured` webhook are prepared. No card details are handled by MediCare. Configuration:

```dotenv
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-private-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

Restart the API and configure the provider webhook to `https://your-domain/api/pharmacy/payment-webhook` for `payment.captured`. Enable automatic capture in the provider account: authorization alone is not marked Paid. Verify payment events against the stored gateway order, integer amount and INR currency; duplicate callbacks do not duplicate confirmation. Only the public key ID reaches Checkout. Prescription orders cannot start online payment until approved. Configure the deployment CSP to permit Razorpay Checkout if you use a CSP.

Keys beginning `rzp_test_` explicitly select sandbox mode. Sandbox capture records **Test paid / Test complete**, releases reserved stock, and cannot progress to fulfillment. Sandbox payments are never represented as real captured money or shipped orders.

**No real payment, refund, shipment, courier API, or video call has been verified.** Gateway tests use mocks and disposable fixtures; supplying credentials alone does not establish production readiness. Use the provider's sandbox before a controlled live transaction; sandbox transactions are not real payments. Finish live acceptance testing, HTTPS/TURN configuration, actual inventory, authorized pharmacist assignment, fulfillment and operational reconciliation before public launch.

Payment references: [Razorpay integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

## Verification

```powershell
npm.cmd --prefix backend run test:care-unit
npm.cmd --prefix backend run test:care-ui
npm.cmd --prefix backend run test:care
npm.cmd run build
npm.cmd --prefix backend run test:routing
```

The integration suite starts its own API on port 5019 with external services disabled and disposable test users/products, then removes only its fixtures. It exercises actual MySQL persistence, appointment ownership, waiting/admission/signaling, device isolation, dashboard privacy, stock contention, checkout retries, prescription permissions/review, fulfillment, COD confirmation, cancellation and expiration. Payment capture/idempotency is simulated with fixtures, not a charge. UI tests use jsdom and mocked media, not a visual browser or real camera. Existing health, emergency, medicine and database regression suites remain available.
