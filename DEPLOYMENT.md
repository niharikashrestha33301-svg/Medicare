# Deploy MediCare to Vercel

The live site uses the root HTML pages and `frontend/public` assets. The Vercel build preserves these pages rather than replacing them with the older Vite homepage.

## Backend requirement

The existing Express server uses MySQL, private uploads and recurring reminder workers. Deploy it on a persistent Node host with persistent private storage and a managed MySQL database. Your laptop's localhost database is not reachable from Vercel. Preserve existing data through a separately reviewed backup/import; this deployment does not migrate or alter it.

Configure the backend environment using `backend/.env.example`, a strong JWT secret, the existing stable encryption keys, production database credentials and HTTPS public URLs. Use the database provider's required TLS configuration. Do not expose MySQL publicly without appropriate network restrictions. Set `NODE_ENV=production`, `APP_PUBLIC_URL` to your Vercel domain and `CORS_ORIGINS` to the allowed website origin. Configure TURN, SMTP and Web Push separately as needed. Keep uploaded medical documents private and persistent. Do not enable pharmacy ordering until its existing authorization requirements are met.

## Vercel dashboard

1. Sign in at https://vercel.com/new and import `niharikashrestha33301-svg/Medicare`.
2. Keep Root Directory at the repository root. Framework Preset: **Other**. The committed `vercel.json` supplies the build settings.
3. Add `MEDICARE_API_ORIGIN` for Production and Preview, for example `https://your-hosted-backend.example.com` (use your real backend origin, without `/api`). Never put database passwords or service-role keys in frontend variables.
4. Deploy. API requests are proxied to the backend, keeping existing same-origin authentication behavior.
5. Without that variable, static pages can deploy, but API requests deliberately return HTTP 503 with a setup message. Login, booking and orders are not operational in that state.

## CLI alternative

Run `npx vercel login`, then `npm run build:vercel` and `npx vercel deploy --prebuilt --prod --yes --project medicare` from this directory. This explicit prebuilt workflow avoids newer CLI versions incorrectly detecting the legacy Vite and Express folders as separate services. Set `MEDICARE_API_ORIGIN` in the build environment before running the local build. Dashboard environment variables do not change an already prebuilt artifact. Do not commit `.vercel` or `.env` files.

The initial static deployment is https://medicare-topaz-nine.vercel.app. Its database API is intentionally unavailable until a hosted backend is configured. GitHub auto-deployment has not been connected.

## Verify after deployment

Check `/api/health` returns a successful database check. Test patient and doctor login, doctor listing, appointment creation/cancellation, consultation authorization, document access and pharmacy cart/orders with authorized test accounts. Check the real backend worker logs for reminders; a static deployment does not run background jobs. Camera/GPS/notifications require HTTPS and user permission. Real TURN, payment, email and ambulance-provider integrations still require their own configuration and verification.
