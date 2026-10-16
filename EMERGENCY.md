# Emergency support and Google Maps

Open `/emergency.html` from the main site's **Emergency SOS** link, the patient emergency panel, the React navigation, or the personal health dashboard.

Both feature pages are served directly by Express and from Vite's public assets. Root-level `emergency.html` and `health.html` launchers also support the standalone site in VS Code Live Server. Opening those launchers as local files sends users to the running backend on port 5000. Development-only CORS permits localhost/127.0.0.1/IPv6 loopback static previews on ports 5500 and 5501. Production uses the configured origin allowlist. Sign in on the origin you use; browser sessions are intentionally not transferred between different origins.

## Current behavior

- **Call 112** opens the device phone handler for India's unified emergency number. **Call 108** is labelled “where available” because regional service coverage varies. Buttons do not send an SOS message, silently place calls, share GPS with emergency responders, or dispatch an ambulance.
- **Use my location** explicitly requests browser geolocation. HTTPS is required in deployment; localhost works during development. Permission denial, timeout, or unsupported GPS leaves manual searches and emergency calls available.
- Hospital-search GPS stays in page memory. Submitting an ambulance request requires separate explicit consent to store the pickup privately. Exact pickup coordinates are removed on cancellation, completion, decline, or expiry. No location is saved in browser storage.
- **Find hospitals in Google Maps** opens Google Maps search around the permitted GPS coordinates. Users can instead prepare a hospital search using a city, locality, or postcode. Google Maps provides the actual nearby listings and published contact numbers.
- **Find ambulance services** opens a separate Google Maps directory search around the permitted GPS location, or the entered city. Listings do not indicate live vehicle availability or confirm a dispatch.
- **Directions & routes** prepares a Google Maps directions link for driving, walking, or public transport. The permitted GPS position becomes the origin only when available; otherwise Google Maps lets the user choose the origin. No fabricated route, distance, or arrival estimate is shown.
- Links state that opening Google Maps shares the selected search/location with Google. No Google map, analytics, or Places request loads automatically in this feature. Google may independently request location inside its own application.
- The **MediCare directory** uses stored hospital information from `/api/emergency`. It is explicitly separate from nearby Google results and is not sorted by distance. It supports filtering, pagination, phone links, and hospital directions. An unavailable database does not block Maps or calls.

This implementation uses Google's documented cross-platform Maps URLs with `api=1`. As requested, it needs no Google API key or Places billing. Google results and routes open in Google Maps, rather than appearing in an embedded map or an inline Places list.

## Ambulance provider boundary

The interface displays exactly **“Live ambulance tracking unavailable”**. It shows no vehicle locations, availability, dispatch progress, or arrival estimates.

`backend/services/ambulanceTracking.js` is the provider boundary, exposed by `GET /api/emergency/tracking` and included in `/api/emergency`:

```json
{
  "available": false,
  "provider": null,
  "vehicles": [],
  "updatedAt": null,
  "message": "Live ambulance tracking unavailable"
}
```

The API-ready dispatch layer is in `backend/services/ambulanceDispatches.js`. Its provider is deliberately `null`. `ambulance_dispatches` is an additive table linking server-issued dispatch IDs to authenticated patient IDs and private provider references. No real dispatch assignments are created automatically.

- `GET /api/emergency/tracking` remains public and returns unavailable without any locations.
- `GET /api/emergency/tracking/dispatches` requires an active patient login and returns only that patient's active dispatch references.
- `GET /api/emergency/tracking/dispatches/:dispatchId` checks patient ownership before contacting a provider. Other patients receive 404. A missing/disconnected/failed provider returns 503 with **Live ambulance tracking unavailable** and no locations.

To connect a provider later, obtain its authorization, API documentation, credentials, location-data permissions, and dispatch identifier contract. Implement a server-only adapter with `name` and `getDispatchLocation(providerDispatchId, {signal})`. Normalize its response to `{dispatchId, latitude, longitude, updatedAt}`. Register that real adapter as `authorizedAmbulanceProvider`. Dispatch assignments must come from a separately authenticated, authorized booking/dispatch workflow, never from patient-supplied ownership fields. No public endpoint permits creating assignments or uploading vehicle positions.

The boundary verifies the returned provider dispatch ID, numeric coordinate ranges and timezone-qualified timestamps. Positions older than two minutes or more than 30 seconds in the future are rejected. Requests have an eight-second deadline and abort signal; provider exceptions never expose credentials. The frontend can later request only its assigned dispatch through these protected routes and render a validated position using an approved map renderer. Provider credentials belong in server environment variables, not frontend code. No provider URL, credentials, or fictitious demo adapter is configured now. Locations and availability are never inferred from a map marker.

GPS permission requests now offer **Cancel location request** and a 15-second fallback so an unanswered browser prompt cannot leave the button disabled forever. Cancelled or late GPS results are ignored. No GPS is requested on page load. Hospital searches do not transmit GPS to MediCare; an explicit ambulance request and driver GPS sharing do.

Run `npm.cmd --prefix backend run test:emergency` for simulated location permission, maps URL, calling-link, safe-rendering and offline checks. Run `npm.cmd --prefix backend run test:emergency-provider` for real MySQL ownership/authentication tests and isolated synthetic adapter validation. Synthetic test coordinates are never registered with the running provider or displayed as live tracking. Tests do not place emergency calls or prove a real GPS fix or provider feed.

## Verification

Run `npm.cmd --prefix backend run test:emergency`. Tests use mocked browser GPS and test-only hospital entries; they never request the developer's actual GPS or make a phone call. Existing database, sign-in, dashboard, and build checks remain available in [DATABASE.md](DATABASE.md).

After `npm.cmd run build`, run `npm.cmd --prefix backend run test:routing` to check Express, temporary Vite dev/preview servers, assets, same-origin API calls, authentication rejection, and static/file launchers. Temporary Vite servers are closed after the test.

Sources: [India's official ERSS](https://112.gov.in/about), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [Google privacy policy](https://policies.google.com/privacy).

## Authorized provider dashboard and emergency requests

Open `/ambulance-provider.html` using the Provider dashboard link on Emergency SOS. Existing MediCare authentication remains active on the connected MySQL database. These changes add tables without replacing existing patient records.

1. A driver signs in with an existing account and submits an organization, authorization/license reference, and contact phone. This creates a Pending application.
2. An administrator signs in on the same provider dashboard, checks the driver's actual authorization independently, and explicitly approves or rejects the application. Decisions are audited. No registration automatically authorizes a provider.
3. An approved driver registers a vehicle. An administrator separately reviews and approves the vehicle.
4. The driver chooses **Start GPS**, permits browser location access, then **Mark available**. HTTPS or localhost is required. Keep the provider page open; background GPS delivery is not guaranteed. Only one vehicle per driver may be available or assigned at a time.
5. A patient opens Emergency SOS, requests GPS permission, enters a contact number, consents to private pickup sharing, and selects **Request Ambulance**. The server atomically reserves the nearest eligible available vehicle within 50 km. Without one, it returns an unavailable error and creates no booking. Initial status is **Requested**, awaiting driver acceptance; this is not an emergency dispatch confirmation.
6. The assigned driver accepts or declines the request. Before acceptance the driver sees only approximate pickup and no patient phone. Acceptance enables private exact pickup, patient contact, fresh vehicle location, distance, and Google Maps links. Status progresses through Accepted, En route, Arrived, and Completed. A patient can cancel active requests.
7. **Track Ambulance** refreshes the patient's own request. Polling updates every ten seconds while open. Stale GPS, revoked approval, inactive accounts, completed/cancelled requests, and other patients' requests cannot expose vehicle coordinates. Public fleet status never returns coordinates.

GPS must be no older than two minutes, no more than thirty seconds ahead, and have reported accuracy within 1 km. Waiting requests expire after five minutes. Maintenance clears vehicle coordinates after five minutes without an update and clears terminal pickup coordinates. Stop GPS immediately removes the driver's stored vehicle location and availability. An active request remains visible with tracking unavailable so users can cancel or call. Phone/contact and non-location request history are retained; define an operational retention policy before production use.

Distance is explicitly straight-line distance, not road distance. ETA is **unavailable** because no authorized routing/traffic provider is configured. Google Maps opens the real route and its own travel estimates; these are not ambulance arrival commitments. Browser-reported GPS is not independent verification of a vehicle's physical position. Administrators must verify operators and vehicle service credentials before approval. Call 112 for emergency assistance; these software requests do not notify public emergency services.

API: `/api/ambulance/status`, `/account`, `/drivers`, `/vehicles`, vehicle `/location` and `/availability`, patient `/requests`, assigned-driver `/provider/requests`, and admin `/reviews`. Authentication, server-side ownership and role checks protect all operational routes. The external-provider dispatch adapter remains a separate disconnected integration. Obtain provider authorization and credentials before implementing it; never store secrets in frontend code.

## Supabase readiness and remaining setup

There is no separate MediCare Supabase project configured. Do not apply these migrations to ChessPath, Rokdaos, or Pastory. No other Supabase project was changed.

`supabase/migrations/20261016084650_medicare_ambulance_security.sql` prepares native Auth-linked provider, vehicle, emergency request, private pickup, private vehicle location, and per-request position tables. It enables RLS, limits exact pickup/tracking to accepted assigned parties, rejects stale location reads, prevents client approval/status/GPS writes, and adds only scoped request/position tables to an existing Realtime publication. Its prerequisites are the preceding MediCare migrations.

`frontend/src/utils/ambulanceRealtime.js` is a staged authenticated subscription helper. It is not active on the current MySQL emergency page. Production currently uses authenticated polling, not Supabase Realtime. Applying SQL alone does not migrate existing MySQL identities or activate dispatch/GPS writes in Supabase.

When the separate project is ready: provide its project URL/ref, place its connection credentials directly in `backend/.env`, review and apply the MediCare migrations to that project, migrate/map existing authenticated identities without overwriting data, implement the native transactional assignment and GPS-write backend against those tables, wire the client subscription helper, then test with two real authorized accounts/devices. Review Realtime publication/subscription permissions and deployment HTTPS. Do not claim Supabase cutover or live Realtime until these steps pass. Existing service-role secrets must remain backend-only.

As previously selected, Google Maps uses links without a Maps API key. An embedded map or inline Places results requires separately configured, restricted Google Maps credentials and billing; neither is claimed as active. Maps links continue to work without them.

## Ambulance verification commands

- `npm.cmd --prefix backend run test:ambulance`: real MySQL/API operations with disposable accounts/vehicles/requests, assignment race, authorization, acceptance, cancellation, GPS freshness and privacy. Fixtures are cleaned up; no ambulance is dispatched.
- `npm.cmd --prefix backend run test:ambulance-security`: isolated PostgreSQL RLS tests; this does not verify a hosted Supabase project or Realtime delivery.
- `npm.cmd --prefix backend run test:ambulance-ui`: simulated browser GPS/API checks for provider buttons and forms.
- `npm.cmd --prefix backend run test:emergency`: simulated GPS permission/errors, Maps links, emergency dial links, safe rendering and offline behavior.
- Frontend build and `test:routing`: actual Express/Vite/preview assets, provider page, API authentication and launchers.

A real driver GPS feed, physical emergency dispatch, device phone call, Google route rendering, and hosted Supabase Realtime have not been verified. No production dummy ambulance data is inserted.
