# NexaHub Completion Audit

> Historical audit snapshot. Subsequent visible workspace/API changes and their
> current limitations are recorded in `NEXAHUB_IMPLEMENTATION_STATUS.md`.

**Audit date:** 7 November 2026  
**Brand:** NexaHub — “Your World. One Hub.”  
**Conclusion:** Working sample storefront with a well-tested browser basket and implemented customer-account integration. **Not yet a functioning production-ready multi-vendor marketplace.**

## Scope, evidence and limitations

This audit inspected the current storefront, Python server, browser tests, runtime configuration, Supabase setup notes, and repository SQL. It ran the complete existing test suite and additional live, read-only checks. Marketplace behavior and database definitions were not changed.

Evidence collected during this audit:

- `npm test`: **59 passed**, zero failed, using Chromium and two workers; approximately 3.5 minutes.
- Test breakdown: 47 basket tests, 10 dialog tests, and 2 anonymous account tests.
- Additional real-browser smoke checks: search for headphones, digital-category filtering, and reset to all eight sample cards passed.
- Proxied preview and `/index.html` returned HTTP 200. `/server.py` and `/.replit` returned 404.
- `/api/orders` and `/api/payments` returned 404, consistent with the absence of commerce routes in `server.py`.
- Supabase Auth public settings returned HTTP 200: email enabled, Google enabled, signup enabled, email confirmation required.
- Read-only, zero-row REST probes returned HTTP 200 for all eight existing marketplace table endpoints.
- Live Google initiation still reached Google's error page with **`redirect_uri_mismatch`**, not its login form. No `invalid_client` message or application JavaScript exceptions were observed.
- Desktop screenshot confirmed the storefront renders. Browser tests include phone-sized account and touch-enabled basket checks, not physical-device certification.

**Limits:** No authenticated Supabase management/database connection is available to this audit. The public API can confirm endpoint/schema availability but cannot establish policies, triggers, constraints, privileged functions, storage configuration, or data integrity. No customer rows were fetched for this audit; table probes used `limit=0`. Remote functions or configuration not represented in the repository cannot be declared absent solely from repository inspection.

No signup, email send, account creation, profile mutation, database migration, payment, order, booking or real Google consent was performed. Existing basket tests use isolated local browser data; this is not a real customer or transaction. Some dialog tests exercise synthetic callback-shaped navigation for focus handling, not a successful OAuth exchange.

This report describes the inspected snapshot; independently merging work requires its own verification.

## 1. Fully implemented and tested features

“Fully implemented” here applies only to the explicitly bounded feature, not the larger marketplace workflow.

| Feature | Verified result | Boundary |
|---|---|---|
| Preview hosting | Python server starts and serves the storefront; workspace files tested above are not served | Development hosting, not production operational certification |
| NexaHub storefront and branding | Existing design, title/tagline, navigation and eight sample listing cards preserved; desktop render checked | Sample content, not database-backed inventory |
| Sample search/category filtering | Real browser search, digital filtering and reset passed | Filters in-page hardcoded cards; no backend search |
| Sample basket additions and quantities | Counts, quantities, line totals, basket totals, minimum quantity and combined 100-item limit passed | Browser-calculated KSh values, not an authoritative quote |
| Browser basket persistence | Reload restoration, removal, clearing and legacy row normalization passed | Same browser/origin; not customer-account or cross-device storage |
| Basket Undo | Removal/clear recovery, expiry, latest-deletion behavior, merging later edits and over-limit protection passed | Eight-second client-side recovery, not cancellation of a real order |
| Cross-tab basket behavior | Add/change/remove/clear synchronization, limit recovery, Undo invalidation and storage-event validation passed | Tested scenarios do not establish atomic concurrent writes |
| Basket malformed-data/error handling | Invalid structures, unsafe totals, denied reads and failed cleanup/save scenarios passed | Visit-only edits remain possible when persistence fails; warnings communicate this |
| Phone-sized basket interaction | Long names, large baskets, scroll access and touch interactions passed at test viewports | Chromium emulation, not iOS Safari or real-device coverage |
| Dialog keyboard behavior | Focus trapping, Escape/close handling, focus restoration and dynamic control boundaries passed | Coverage is Chromium and the tested entry points, not a full accessibility audit |
| Signed-out account UI | Desktop 1280px and phone 402px: real Supabase SDK loads, mode switching works, required fields block empty submissions, blank-email reset is blocked | No registration, email delivery, authenticated profile or login success tested |

Existing basket functionality should be retained rather than rebuilt.

## 2. Implemented but not tested end-to-end

| Feature | Implementation found | Required proof |
|---|---|---|
| Customer email/password registration | Supabase `signUp`, name metadata and confirmation return origin | Real owner-controlled signup, delivery, confirmation, one corresponding profile and login; reuse existing accounts where possible |
| Customer password login | Supabase `signInWithPassword` and error presentation | Correct/incorrect password, unconfirmed account, allowed/denied access and expired-session behavior |
| Session restoration and sign-out | SDK session loading, auth events and `signOut` | Reload, expiry/refresh, multiple tabs, logout and blocked access after logout |
| Password recovery | Reset email request, recovery-event UI and password update | Real email/link, expiry/reuse, mismatch validation and successful login with changed password |
| Profile read/edit | Reads `profiles.display_name, phone` by authenticated `id`; updates same row and requires returned ID | Existing-row load, save/reload, permissions/error handling and cross-account isolation |
| Auth return processing | Supabase SDK initialization, auth event handling and callback/recovery-shaped URL handling | Real email and Google return, session establishment and invalid/expired callback handling |
| Existing Supabase marketplace schema | Owner reports migration applied; all eight table endpoints respond to zero-row probes | Read-only inspection of actual columns, keys, constraints, RLS policies, grants, triggers and functions |

The signed-in profile form and account panel exist, but their rendered authenticated state was **not verified**. This is not yet a complete customer dashboard.

## 3. Partially implemented features

| Area | Present | Unfinished or blocked |
|---|---|---|
| Google sign-in/registration | Google button invokes Supabase OAuth; provider enabled; authorization request reaches Google | Current provider rejection prevents login, consent, callback, session and profile verification |
| Customer profiles | Existing table and read/edit UI | Automatic creation trigger and ownership policies unverified; no browser fallback insertion is attempted |
| Customer dashboard | Profile/email/sign-out panel | Orders are an explicit placeholder; no addresses, purchases/downloads, bookings or support workflow |
| Marketplace product listings | Static physical/digital/service/travel cards; `products` and `categories` REST endpoints exist | No live catalog reads, product detail pages, variants, inventory or listing administration |
| Shopping cart as commerce | Tested sample browser basket | No product IDs, authoritative server quotes, stock reservations, account linkage or checkout handoff |
| Checkout | Clearly labeled preview button and explanatory notice | Button only displays a toast; no shipping/billing, order creation, payment initiation or confirmation |
| Seller registration | Promotional links and store-name/email dialog | Continue only displays a placeholder toast; no persisted application or verification |
| Digital products | Sample digital cards and cart entries | No asset upload, protected storage, entitlement or secure delivery |
| Services | Sample cards/categories | Buttons only show notices; no actual enquiry, provider workflow, availability or fulfillment |
| Travel/accommodation | Sample stay card/category | No live accommodation inventory, rates, availability, booking or reservation supplier |
| Bookings | Category entry and existing `bookings` endpoint | No dates/time-slot UI, availability query, reservation lifecycle or collision prevention |
| Responsive design | Existing CSS breakpoints and tested phone-sized sample/account interactions | Complete signed-in, seller/admin/checkout flows do not exist; Safari/Firefox, device rotation and full accessibility remain unverified |

### Google configuration blocker

The current live Google attempt still returns `redirect_uri_mismatch`.

Supabase's observed authorization request uses:

```text
Client ID:
786403845062-9tuamqbe2ngfu729tk3e2jrc6c3p6qcf.apps.googleusercontent.com

Redirect URI:
https://oixruhlxundtgmhzeysj.supabase.co/auth/v1/callback
```

The previously supplied screenshot showed the project reference `oixruhuxundtgmhzeysj` rather than `oixruhlxundtgmhzeysj` in the authorized redirect URI. Replace the incorrect entry with the exact callback above on the matching Google web client, save, reopen to verify persistence, and allow Google's displayed propagation interval. Do not rotate secrets or create another OAuth client merely to retry.

Separately confirm Supabase permits the actual NexaHub app return origin and the eventual published origin. Google returns to Supabase; Supabase then returns to NexaHub. Consent/test-user availability and production consent requirements also need checking. None of these settings is proven by the provider-enabled flag.

## 4. Missing functional features

“Missing” means no usable application implementation was found. Existing remote tables do not count as completed workflows.

### Sellers and catalog

- Persisted seller applications, verification evidence, approval/rejection and suspension.
- Secure seller roles and role-protected dashboard.
- Store management, product/service/accommodation creation and editing, media upload and moderation.
- Product identifiers, variants/SKUs, stock management, publication status and authoritative pricing.
- Seller-specific orders, fulfillment, booking administration, revenue, commissions and payout visibility.

### Checkout, payments and orders

- Trusted backend order/checkout functions. The Python server only serves HTML and has no commerce handlers.
- Cart validation against current catalog, inventory, currency, shipping and tax.
- Durable checkout/order creation, immutable line-item price snapshots and inventory reservation.
- International payment-provider integration and Kenyan M-Pesa integration.
- Provider callbacks/webhooks with authenticity validation, replay protection and idempotency.
- Server-verified payment states, reconciliation, refunds, disputes, cancellations and seller payouts.
- Customer order history/details, receipts, shipment tracking and seller/admin order management.
- Defined order/transaction state machine with safe retries and audit trail.

**There is no real payment confirmation in the app. The preview checkout is not a simulated successful transaction and must not be presented as one.**

### Digital fulfillment, services and bookings

- Private digital assets, seller upload validation/scanning, buyer purchase entitlements and short-lived download authorization.
- Download library, access revocation/refund rules and delivery audit records.
- Service provider profiles, service scope/options, enquiries, scheduling and completion/dispute handling.
- Accommodation inventory, date-based pricing, occupancy rules, time zones and supplier integrations where needed.
- Transactional availability checks, reservation expiry, double-booking prevention, confirmation, cancellation and refund policies.

### Administration and global operations

- Admin dashboard and backend authorization to manage customers, sellers, products, orders, bookings and transactions.
- Admin approval/moderation actions, restricted role assignment and tamper-resistant administrative audit logging.
- Production support/dispute process and functional contact/help/legal pages; current footer labels are not those workflows.
- Supported-country/currency/payment/payout rules, address formats, taxes, shipping and localization.
- Production monitoring, alerting, restore-tested backups, incident response and operational runbooks.

## Supabase inspection findings

| Table | Current read-only API evidence | App usage / audit limit |
|---|---|---|
| `profiles` | HTTP 200 for zero-row probe; `id`, `display_name`, `phone`, `created_at` individually accepted | Only table used by current customer profile UI; ownership/provisioning unverified |
| `seller_profiles` | HTTP 200 for zero-row probe | No seller application/dashboard integration found |
| `categories` | HTTP 200 for zero-row probe | Storefront categories are hardcoded |
| `products` | HTTP 200 for zero-row probe | Storefront listings are hardcoded |
| `orders` | HTTP 200 for zero-row probe | No app order creation/history integration |
| `order_items` | HTTP 200 for zero-row probe | No app line-item integration |
| `payment_transactions` | HTTP 200 for zero-row probe | No provider/payment integration |
| `bookings` | HTTP 200 for zero-row probe | No booking integration |

An HTTP 200 with `limit=0` confirms API relation availability; it proves neither populated data nor effective row security. No anonymous customer/order data was retrieved to test exposure.

Before building on these tables, inspect the existing schema and reuse it. Do **not** rerun the superseded `customer_profiles` migration, create duplicate equivalents, replace the database, or infer missing backend definitions from missing UI.

Read-only verification still needed:

1. Run/review existing `supabase/verify-auth.sql` for profile RLS, policies, grants and auth-user provisioning trigger.
2. Inspect the actual trigger function for compatible name metadata, safe privileges/search path, and reliable one-profile-per-auth-user behavior.
3. Inspect RLS/grants for every marketplace table; test guest/customer/seller/admin access separately.
4. Confirm customers cannot promote themselves or change payment/order authority fields; seller and admin claims must not derive from user-editable metadata.
5. Inspect existing foreign keys, uniqueness, checks, indexes, transactional stock/booking mechanisms and any remote backend/storage functions.
6. Validate cross-account isolation using existing authorized test accounts. A frontend `.eq('id', user.id)` is not an authorization boundary.

## Exact remaining delivery sequence and acceptance gates

### Stage A — complete and prove existing accounts

1. Correct/save the Google callback mismatch and verify the exact app-origin allowlist in Supabase.
2. Review existing RLS and provisioning using read-only metadata before making any targeted repair.
3. Verify sender configuration, confirmation/recovery templates, delivery and production rate limits.
4. With owner-controlled accounts, test email signup/confirmation/login, Google login/return, exactly one profile, edits/reload, recovery, sign-out and session expiry.
5. Verify one customer cannot read/update another profile or grant themselves privileges. Confirm Google/email identity-linking behavior without creating duplicate test users.

**Gate:** successful real account lifecycle with evidence; no duplicate profile/user rows and no cross-account access. No marketplace schema recreation.

### Stage B — activate sellers and real catalog

1. Map current tables/constraints to seller applications, verification, trusted role assignment and moderation.
2. Implement customer/seller/admin backend authorization and usable seller/admin approval screens.
3. Connect catalog reads and seller CRUD to existing products/categories; add focused schema changes only if inspection proves a requirement is absent.
4. Add media management, price/currency/stock rules and product details; preserve sample design while clearly separating samples from purchasable inventory.

**Gate:** approved seller publishes valid inventory; unauthorized sellers/customers cannot edit it; moderation and stock controls work.

### Stage C — real orders, checkout and payments

1. Confirm operator business country, buyer/seller countries, settlement currencies, marketplace onboarding and payout requirements.
2. Select an eligible international marketplace payment provider and confirm a supported Kenya M-Pesa path (direct merchant integration or an approved provider supporting it). Do not assume a provider supports every country or marketplace settlement model.
3. Put provider credentials and sensitive operations in a secure backend, never in browser code.
4. Create authoritative quotes and durable orders from product IDs, validating stock, shipping, tax and totals server-side.
5. Implement provider initiation, verified callbacks, idempotent state transitions, failure/timeout recovery, reconciliation, refunds and seller commission/payout accounting.
6. Connect customer order history, seller fulfillment and admin transaction management.

**Gate:** provider-supported test-mode validation clearly labeled as testing, followed by authorized controlled live purchase/refund and reconciliation before launch. No invented success responses; browser returns alone never mark orders paid. No transactions were performed by this audit.

### Stage D — protected delivery and bookings

1. Link paid order entitlements to private digital assets and backend-issued expiring downloads.
2. Implement service/accommodation listing details, availability, booking requests and transactional reservations.
3. Apply time-zone, cancellation, expiry, completion and refund rules with customer/seller/admin views.

**Gate:** unauthorized/unpaid users cannot download; duplicate/concurrent bookings cannot oversell capacity; cancellations/refunds leave correct records.

### Stage E — production launch hardening

1. Complete functional admin controls, audited role management and privileged-action protection.
2. Test server input validation, RLS/role boundaries, price tampering, webhook forgery/replay, download leakage and double-order/booking races.
3. Review security headers, third-party SDK dependency control (currently a major-version CDN URL), XSS/session risks, sensitive-log handling, rate limits and abuse protection.
4. Complete mobile/desktop and real Safari/Firefox testing, screen-reader/keyboard accessibility and all new-role flows.
5. Finalize legal/privacy/refund/vendor policies, moderation/support and country/tax/payment restrictions.
6. Configure production domain/redirects, email/provider environments, monitoring, backups/restore and failure-response runbooks.
7. Run end-to-end acceptance and load/failure tests against the deployed configuration with approval.

**Gate:** proven customer purchase, seller fulfillment/payout accounting, protected digital delivery, booking lifecycle and admin remediation with operational monitoring. Do not declare launch-ready before these gates pass.

## Known issues and residual risks

- **Launch blocker:** Google `redirect_uri_mismatch` persists in this audit.
- **Launch blocker:** real signup/profile provisioning and RLS isolation remain unverified.
- **Launch blocker:** no functional marketplace checkout, payment, order, seller/admin, download or booking lifecycle.
- Sample trust copy mentions “Secure checkout integration” and digital delivery although neither is connected. The footer/checkout correctly disclose preview status, but launch copy must match actual capability.
- Basket storage is shared by browser origin, not authenticated customer; it is not a private account basket or cross-device feature.
- Cross-tab storage synchronization is not atomic multi-user inventory/order control.
- Test success covers only current scenarios. Real iOS Safari, Firefox, rotation, load and adversarial authorization/payment tests are not proven.
- Minor observed issue: favicon request returns 404; this does not prevent storefront use.
- No privileged backend configuration, production deployment, database security certification or formal security scan is claimed by this audit.

## Preservation and audit outcome

Retain the existing NexaHub design, branding, responsive foundation, working sample search, account code and tested basket/dialog behavior. Finish integration and verification incrementally rather than rebuilding completed features.

**Only this report was added as an audit deliverable. No existing application feature, database schema, secret or provider setting was changed.**
