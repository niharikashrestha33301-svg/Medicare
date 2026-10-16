# Online Pharmacy setup and verification

## Current catalogue upgrade (16 October 2026)

The active site uses the existing authenticated MySQL/Express backend. It now has **120 PMBI-sourced reference products plus the 21 preserved sample listings**. The new blue-and-white pharmacy layout includes clickable category tiles, name/brand/SKU search, stock/prescription/catalogue-type filters, sorting, 24-item pagination with Load more, selected pack quantities, immediate cart/total refresh, and a dedicated product page at /pharmacy-product.html?id=PRODUCT_ID. Existing prescription verification, checkout, order history and unrelated features remain available.

The reference snapshot is backend/data/pmbi-reference-catalogue.json, retrieved from https://www.pmbi.co.in/ProductList.aspx on 16 October 2026. Names, packs and reference MRPs are copied as factual source fields; categories are navigation groupings. Actual brands/manufacturers, prescription classification, clinical usage, image rights and MediCare stock are not established by that table. All imported rows have zero stock and reference_only=true. Both cart and checkout independently reject reference-only rows, even if their stock is accidentally positive. Source MRPs are labelled reference values, not current MediCare offers. Import is idempotent and never overwrites existing records.

**Photo status:** the earlier AI-generated/demo pictures are no longer used on cards or details. A labelled Exact-pack photo unavailable placeholder is shown until a genuine supplier/owner photo is uploaded and an admin confirms exact brand/strength/pack matching and usage rights. No random pack photos have been substituted. PMBI's copyright page requires permission for reproducing its materials and does not grant blanket image reuse: https://www.pmbi.co.in/copyright.aspx . An authorized supplier feed or licensed product-image set is still required to complete authentic photos for all products. Existing generated image files are retained, but are not referenced by the current catalogue renderer.

The inventory form now includes brand/strength, product-specific HTTPS source, source name, image-match/rights attestations, inventory verification and clinical content. Only an explicitly authorized pharmacist can publish verified usage/precautions. Unverified clinical content is not rendered as guidance. Replacing an image revokes existing photo verification in the same transaction; the UI clears the previous image confirmations when a new file is selected. Reference products leave reference-only status only after an authorized admin explicitly verifies actual supplier, stock, price and prescription classification. Sample products retain their sample flag.

Checks: test:pharmacy-catalogue compares all 120 names/packs/MRPs with the source snapshot, checks zero stock/reference flags and ten categories, pagination, filter/category controls, placeholders and the dedicated details page. test:care and test:pharmacy-development cover real database/API carts, selected quantities from the new detail page, stock races, idempotency, private documents, pharmacist approval, fulfillment/payment guards and legacy features. test:pharmacy-visual uses an isolated headless Chrome profile and a 393px emulated mobile viewport; it reported no horizontal overflow. Desktop and mobile captures are in backend/test-artifacts. No real charge or shipment was tested. test:pharmacy-images now verifies truthful catalogue/image publication behavior rather than requiring generated product photos.

Commands: npm.cmd --prefix backend run import:pharmacy-reference and npm.cmd --prefix backend run test:pharmacy-catalogue. Older notes below describe historical demo setup; this section takes precedence for the current image and reference-listing behavior.


Open `/pharmacy.html` from the existing Online Pharmacy navigation. Sign in with an existing patient account for shopping, or an authorized admin account for inventory and order management. The existing healthcare design and authentication remain intact.

## Actual connection status

The running pharmacy uses the existing local MySQL `medicare_db` through authenticated Express APIs. No separate MediCare Supabase project or credentials are configured. The connected Supabase account only contains other projects, which were not changed. The native Supabase migration described below is prepared and locally tested, not deployed or connected to the pharmacy runtime.

Real inventory is never invented. The explicitly requested local development setup now contains eight labelled demo listings because the inventory was empty. Demo prices, packaging illustrations and quantities are sample data, not real availability. They are hidden in production and cannot be used for real checkout.

## Configure an authorized pharmacy

Before enabling real ordering, the operator must verify the pharmacy's applicable licence, pharmacist authorization, actual stock, dispensing procedures, delivery coverage, pricing and fulfillment arrangements. Application flags are operator attestations; they do not establish regulatory authorization. Confirm applicable requirements with the relevant State/UT licensing authority. Official references: [CDSCO Acts and Rules](https://www.cdsco.gov.in/opencms/opencms/en/Acts-Rules/) and [national/state drug licensing portal](https://statedrugs.gov.in/SFDA/Homepage).

1. Use an existing authorized admin account. If necessary, run the existing `npm.cmd --prefix backend run create:admin` setup and follow its prompts. Never grant admin access through public patient registration.
2. Sign in on the pharmacy page. Inventory management and the order queue appear for admins. Add the real SKU, name, category, manufacturer, pack size, description, price in rupees, actual available stock, and prescription classification. Publish only reviewed inventory. Upload an optional PNG/JPEG product photo up to 1 MB. Product photos are public only while the medicine is published; prescription files remain private.
3. Set the following directly in `backend/.env`, using real authorization details:

   ```dotenv
   PHARMACY_ENABLED=true
   PHARMACY_AUTHORIZED=true
   PHARMACY_LICENSE_REFERENCE=your-actual-authorization-reference
   PHARMACY_REVIEWER_IDS=authorized-pharmacist-admin-user-id
   PHARMACY_COD_ENABLED=true
   ```

   Only enable COD when actual cash-on-delivery operations are supported. The pharmacy admin screen shows the current user's ID. Pharmacist reviewers must be active admin accounts and explicitly listed; a normal admin cannot read or approve prescription documents just by having the admin role. Verify credentials independently before assigning a reviewer. Keep licence details and secrets out of frontend code and chat.
4. Restart the MediCare backend normally after environment changes. Do not stop MySQL. The readiness panel checks the operator enable flag, authorization attestation/reference, an active reviewer, published in-stock inventory, and a supported payment method. Only then can real checkout accept orders. Development-only test checkout follows the separate rules below. Missing requirements are listed on the admin screen.
5. For online payments, configure real Razorpay key ID, secret, and signed webhook secret through the existing server-only environment variables. Configure the `payment.captured` webhook for `/api/pharmacy/payment-webhook`. Confirm a real capture before fulfillment. Test keys are labelled sandbox, never treated as real captured payments, and sandbox orders cannot be shipped. No real payment has been tested during this change.

## Inventory and order behavior

- Prices are stored as integer paise, displayed in INR, and recalculated on the server. The browser cannot choose the final order total.
- Search supports name, SKU and description; changing category immediately refreshes results. The eight requested categories are always available. Sort by name, ascending/descending price, or newest. Loading, failures, empty catalogues, out-of-stock products and setup-only checkout states are shown.
- Add to Cart, increase/decrease quantity and Remove save to the patient's database cart. Quantity is limited to 99 per line; availability is validated again at checkout.
- Stock is reserved transactionally at order placement. Patient/cart and sorted product locks prevent concurrent cart edits and overselling. Checkout UUIDs prevent duplicate order creation.
- Editing inventory requires the current version so stale stock edits fail instead of overwriting newer reservations. Images have MIME, signature, size and version validation. Image upload failure reports that inventory was saved and the photo needs retrying.
- The dedicated `/pharmacy-orders.html` page uses the same authenticated order queue and design, with real status/events and unmistakable TEST CHECKOUT labels.
- **Archive** removes a medicine from browsing and new checkout without deleting its stock or past order references. Edit and publish it again to restore it. Physical deletion is intentionally not offered for order-linked inventory.
- Patients upload PDF/PNG/JPEG prescriptions up to 2 MB privately through the existing Health Dashboard document API, then select one of their own documents at checkout. The order stores its own immutable document copy.
- New prescription orders require approval **before checkout**. The patient uploads a private prescription, adds medicines to the cart, and requests verification. The pharmacist reviews an immutable document copy and the exact medicine/quantity list. Checkout requires an approved review belonging to that patient, matching the current cart, reviewed within seven days by a still-authorized active reviewer, and not already used. Changing quantities requires matching review again; approval cannot be reused. Existing older Awaiting review orders retain their original review/expiry workflow.
- Orders show actual items, total, prescription/payment status, address and an event timeline. Admins record Confirmed -> Packing -> Dispatched -> Delivered transitions. Dispatch requires a real carrier and tracking number. COD delivery requires explicit actual collection confirmation.
- Delivery tracking is an operator-entered shipment timeline and carrier/reference, not a live courier GPS feed. Connect a real authorized courier adapter before claiming automatic courier tracking.
- Cancellation is permitted before fulfillment/payment reconciliation starts. It releases stock once. Expiry maintenance releases stale reservations. Paid/in-flight payment orders require operator reconciliation/refund handling; do not mark an unverified refund successful.
- Patient order/document ownership is enforced server-side. Private responses use no-store caching. Current authenticated APIs use existing MySQL/JWT access checks, not hosted Supabase RLS.

## Separate MediCare Supabase cutover

`supabase/migrations/20261016130842_medicare_pharmacy_security.sql` follows the native MediCare Auth foundation (`20261015135806_medicare_patient_security.sql`). It prepares products, images, carts, orders, immutable item snapshots, prescription copies, events and explicitly authorized pharmacist memberships. It enables RLS on every table, revokes default client grants, allows public published catalogue reads, limits patient records to their owner, and restricts prescription reads to the owner or active assigned pharmacist admin. Browser writes to prices, stock, roles, payment or order status are denied. Database constraints block dispensing unreviewed prescriptions and shipping sandbox orders.

This migration alone does not connect the existing MySQL runtime to Supabase. Once the separate `medicare` project is ready:

1. Provide its project URL/ref; put its database connection string and Auth configuration directly in `backend/.env` using the existing example entries. Never use another project's credentials or frontend service-role keys.
2. Review migrations and apply only to that separate project. Verify Data API grants/RLS and run Supabase security advisors. Follow [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
3. Plan and verify identity mappings from existing integer MySQL user IDs to native Auth UUIDs; do not silently match or replace patients by email. Back up and reconcile orders, documents, stock and review history before switching.
4. Implement the transactional pharmacy persistence adapter against native tables, using verified native Auth identities, then wire the existing APIs to it. Keep checkout, review, stock, payment and shipment writes backend-only. This adapter and identity cutover are not activated by this change.
5. Verify patient-to-patient isolation, active pharmacist access, concurrent stock reservations, cancellation/retry, uploads, payments/webhooks and real fulfillment on the configured project before enabling production ordering.

## Checks performed

- `npm.cmd --prefix backend run test:care`: real MySQL/API inventory and cart operations, competing stock checkouts, idempotency, owned prescription access, pharmacist approval/rejection, fulfillment, payment guards, cancellation/expiry; new image upload/signature/size-limit path, stale version rejection, archive/history retention, readiness and phone checks. Disposable fixtures are removed; no shipment, charge or real medicine inventory is created.
- `npm.cmd --prefix backend run test:care-ui`: simulated patient pharmacy sign-in, details, cart, checkout and logout; consultation regressions.
- `npm.cmd --prefix backend run test:pharmacy-ui`: simulated admin add/edit/image/archive, INR conversion, category filters and disabled setup state.
- `npm.cmd --prefix backend run test:pharmacy-security`: isolated PostgreSQL schema/RLS queries, hidden stock, private orders/prescriptions, reviewer access and blocked client writes. This is not a hosted Supabase connectivity test.
- Frontend production build and `test:routing` verify existing feature pages/assets and protected API routes.

Real pharmacy authorization, real inventory accuracy, pharmacist clinical decisions, live payment capture, courier delivery, and hosted Supabase connectivity remain operator/integration verification tasks.

## Development demo and test checkout (2026-10-16)

The current local site has PHARMACY_DEMO_ENABLED=true and uses its existing MySQL backend. This fixes the unavailable experience for development without pretending the pharmacy is licensed or real payments/delivery are ready. PHARMACY_ENABLED and PHARMACY_AUTHORIZED remain unchanged; real ordering stays protected.

Run `npm.cmd --prefix backend run setup:pharmacy-demo` to seed eight labelled rows only if inventory is empty. Running it again preserves every existing record. It refuses production. Demo rows are permanently marked is_demo; normal inventory edits cannot remove that label. All eight categories are represented; Personal Care deliberately includes an out-of-stock example. Product pictures are local SVG packaging illustrations explicitly labelled as demo. They are not photographs of actual products.

Choose **Development test checkout (no payment or delivery)** and click **Save test checkout**. A real database record is created with payment_method=Test, payment_mode=Test, payment_status=Unpaid, and status=Test complete. Its event states no payment, reservation, dispensing or delivery. The cart is cleared, stock is unchanged, and fulfillment/payment/cancellation actions cannot treat it as a live order. Test checkout still validates authenticated ownership, quantities, available demo stock, contact details, totals, idempotency and prescription approval. No successful payment is fabricated.

Prescription-only samples remain blocked until an actual authorized pharmacist admin reviews the document and exact cart. No pharmacist is automatically assigned or approval fabricated. Configure PHARMACY_REVIEWER_IDS for the verified active admin reviewer, restart the backend, and use its prescription queue. Do not bypass verification to test restricted medicines. Non-prescription demo items can be tested immediately with a patient login.

NODE_ENV=production always hides demo listings and rejects development test checkout, even when PHARMACY_DEMO_ENABLED=true. Real checkout rejects demo products. Production deployment still requires actual inventory, pharmacist/licence/fulfillment readiness and payment/COD configuration. MySQL uses server-side role and ownership checks; hosted Supabase RLS is not the active persistence layer. Native Supabase cutover remains a separate task and must include these new pre-checkout review/test-mode rules before switching.

Additional verification: `npm.cmd --prefix backend run test:pharmacy-development` runs actual MySQL/API operations and DOM controls backed by that API: demo cards, details, search, category/sort changes, add/remove/quantity controls, totals, test-checkout button, history page, pharmacist approval, document privacy, changed-cart/reuse denial and production safeguards. These use disposable accounts and records; DOM execution is not a physical browser/payment/courier test. Existing `test:care` still checks real-mode stock races, idempotency, legacy prescriptions, cancellation/expiry, fulfillment and verified-capture guards.

Additional demo products: gentle face cleanser, sunscreen lotion, lip balm, body lotion, digital thermometer and home first-aid kit. Each has a separate AI-generated illustrative product photo, sample INR price and demo stock. Use npm.cmd --prefix backend run setup:pharmacy-products to add missing rows without overwriting existing records. Images are local assets under frontend/public/pharmacy-products and appear on cards and detail views. These are not photos of real inventory.

The hygiene expansion adds four more demo listings: generic antiseptic liquid (not an official Dettol-branded product), liquid hand wash, cotton roll and adhesive bandages. Every one of the 18 intended demo catalogue products now has an individual AI-generated illustrative image, including sunscreen and the older medicine listings. Demo brand names, prices and quantities never establish real availability. Image loading uses a clearly labelled demo fallback if a local asset is temporarily unavailable.

First-aid demo additions: Handyplast-style adhesive strips (searchable as Handiplus), crepe bandage and medical paper tape, each with a separate illustrative product photo. These are generic demo items, not official branded inventory. The expanded catalogue contains 21 demo listings; prescription, real-order and payment restrictions remain unchanged.
