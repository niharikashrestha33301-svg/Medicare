# MediCare medical assistant

The floating **Your care, a little clearer** button is available on the existing HTML pages and the Vite frontend. Its styles are scoped in a shadow root, so it does not change the existing website layout.

## Run

```powershell
cd backend
npm run setup:assistant
npm start
```

Open http://localhost:5000. The setup command creates the history table and a random 256-bit encryption key in `backend/.env`. Keep this key private and stable; losing it makes previously saved chats unreadable. The database and `.env` must be backed up separately and securely.

Without an API key, the widget explicitly shows **Guided symptom navigation**. This mode asks structured questions and uses basic symptom rules. It is not an AI model or a clinically validated triage system.

To enable live AI, add these values to `backend/.env`, then restart the backend:

```dotenv
OPENAI_API_KEY=your-own-api-key
OPENAI_MODEL=gpt-4.1-mini
```

The API key stays on the server. Live AI is only used when the patient explicitly enables the **Use AI analysis** checkbox. It sends the conversation to OpenAI; basic email/phone redaction is applied, but patients should avoid entering personal identifiers. Provider data policies still apply. A provider failure switches visibly to guided fallback; it does not prevent normal website bookings.

## Behavior and safety boundaries

- Emergency patterns run before any model request. They cover common warning signs such as chest symptoms, airway/breathing problems, stroke signs, serious bleeding, and selected pregnancy/infant warning signs. The model can additionally escalate; it cannot override a local emergency flag.
- This is care navigation, not diagnosis, treatment, medical clearance, or a replacement for a clinician. Keyword screening is incomplete and can over-escalate or miss descriptions. It requires clinical review and broader evaluation before real patient deployment.
- The model returns only validated specialist, follow-up-question, readiness, urgency and emergency fields. It cannot provide user-visible diagnoses, prescriptions, medicines or dosages; replies are composed from controlled templates.
- Doctor recommendations come from active MySQL doctor records, with actual fees and slot listings. Seeded demo records remain labelled. A database record does not establish that a doctor or their credentials have been independently verified.
- The assistant checks date-specific slot availability, rejects past slots, and serializes its bookings using a database transaction. Prices come from the server's INR doctor fee. No payment gateway or charge is created.
- Patients can sign in and book without leaving the chat. Sign-in passwords go only to MediCare's authentication endpoint, never into the conversation or model prompt. Chat messages are not automatically attached to appointments.
- The main HTML application's appointment list refreshes after an assistant booking.

## Privacy and retention

Chats are held in page memory by default; the assistant does not put symptom messages in local/session storage. Closing the panel preserves the chat for the current page visit; **New conversation** clears it. Normal request processing still occurs on the server.

**Save with consent** requires a signed-in patient and an explicit checkbox. Only that account can retrieve or delete the saved chat. Chat payloads use AES-256-GCM with an account-bound authentication tag. A maximum of 30 conversations can be saved per patient. Saved conversations expire after 30 days; an hourly cleanup removes expired rows and expired rows are excluded from retrieval immediately. Consent version and timestamps are recorded. Each saved snapshot can be removed through **Saved chats**.

Use HTTPS and an appropriately secured database/secret-management environment before deploying real patient information. Do not commit `.env` files, encryption keys, or API keys. No full compliance certification or clinical validation is implied by this implementation.

## API

- `GET /api/assistant/config`: AI/storage availability; no secrets.
- `POST /api/assistant/chat`: bounded conversation plus optional `aiConsent: true`. Does not save chats.
- `GET /api/assistant/availability?doctorId=...&date=YYYY-MM-DD`: free, future slots in India time, up to 90 days ahead.
- `POST /api/assistant/book`: authenticated patient; `doctorId`, `date`, `slot`.
- `POST /api/assistant/history`: authenticated patient; `messages`, `consent: true`.
- `GET /api/assistant/history`: current patient's unexpired chats.
- `DELETE /api/assistant/history/:id`: deletes only a chat belonging to that patient.

## Verification

```powershell
cd backend
npm run test:assistant
node scripts/assistant-smoke.js
node scripts/assistant-ui-smoke.mjs
```

Unit tests cover emergency patterns, follow-ups, model schema validation, provider failure, consent, and encryption. Live integration tests exercise database recommendations, account isolation, deletion, concurrent booking, and the chat UI. Smoke tests clean up their own test records. AI transport/schema is tested with a stub; a real provider round trip cannot be verified until an API key is configured.

## References

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [NHS chest pain warning signs](https://www.nhs.uk/symptoms/chest-pain/)
- [London Ambulance Service: emergency warning signs](https://www.londonambulance.nhs.uk/our-services/emergency-care/calling-999/)

The NHS sources inform the conservative warning-sign examples; the implementation does not reproduce a validated clinical decision rule.
