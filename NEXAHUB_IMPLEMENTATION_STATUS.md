# NexaHub — visible implementation status

Updated: 7 November 2026. Brand: **NexaHub — Your World. One Hub.**

This is a working readiness-stage extension of the existing website, **not a
claim that checkout, rider operations or the marketplace are production-ready**.
The earlier completion audit is a historical snapshot; this document describes
the subsequent website changes.

## Open the changes in Preview

Use the new workspace navigation below the existing header:

| Page | Preview route | What is actually implemented |
| --- | --- | --- |
| Storefront | `/` | Original design structure, approved logo, category/sample cards, account dialogs and basket retained. Navy, champagne-gold and ivory styling; new workspace navigation. |
| Published catalog | `/?workspace=catalog` | Server reads existing Supabase published products and categories; search, product details, explicit empty/error states. No sample inventory fallback or purchase action. |
| My NexaHub | `/?workspace=customer` | Account sign-in gate, profile dialog entry, customer-scoped order, line-item, booking and payment-history readers. Requires a real signed-in session and working RLS. |
| Seller desk | `/?workspace=seller` | Account-owned seller profile, listing and order-item readers; application and delivery-request forms with honest server-side blocking. No balance invented from order totals. |
| Rider desk | `/?workspace=rider` | Registration form, consent/vehicle selection, readiness information, job and earnings areas explicitly marked unavailable. **No application is saved and no jobs can be accepted.** |
| Delivery | `/?workspace=delivery` | Customer order lookup entry, delivery-code form, fee-readiness response and clearly labelled status workflow guide. **Not live tracking or working OTP completion.** |
| M-PESA readiness | `/?workspace=payments` | Configuration warnings, real-account order selection when orders exist, protected readiness request and payment-record reader. **No STK request or settlement is implemented.** |
| Admin | `/?workspace=admin` | Sign-in and server-owner authorization boundary; read-only record panels and blocked management-action form. **No approvals, suspensions, payouts or record changes execute.** |

The public catalog returned HTTP 200 with **zero visible published products and
zero visible categories** during this verification. This describes anonymous
visibility at that moment, not a claim that all database tables are empty.
At most 50 records are read per list; search currently applies to that returned
catalog page. Full catalog search/pagination remains work.

## Security and data handling

- Private API requests validate the supplied bearer token using Supabase
  `/auth/v1/user`; the server does not trust a browser-selected role or decode
  an unverified JWT to authorize access.
- Reads use the existing public project key **and the verified customer's
  token**, preserving Supabase RLS. Explicit customer/seller filters and
  returned-record ownership checks provide an additional boundary.
- Admin access requires trusted server configuration
  `NEXAHUB_ADMIN_USER_IDS`. It is **not configured**. User-editable profile
  metadata cannot grant owner access. The owner's own Supabase RLS permissions
  must also be reviewed; this API deliberately does not bypass them.
- No service-role key, Daraja credential or payout secret was added to frontend
  code. Browser forms do not persist private application/address/OTP drafts.
  Private screens clear when the account changes.
- JSON request sizes are limited. API responses are `no-store`; request logs
  omit query strings and bodies. No sensitive provider error payload is
  returned to the browser.
- No database migration, table creation, user creation, seed data, provider
  transaction or financial transfer was performed.
- POST routes currently reject persistence or execution explicitly. Even an
  incoming callback claiming `ResultCode: 0` cannot mark anything paid.
- Integer commission arithmetic and allowed delivery-state transitions exist
  as isolated, tested domain rules. **They are not a persisted ledger, provider
  confirmation, atomic job assignment or an OTP service.** No rate was assumed.

## Verification performed

- **17 Python backend tests passed**, using isolated upstream fixtures for
  ownership filtering, admin-role denial, request gates, commission conservation
  and delivery transitions. These fixtures were never inserted into Supabase.
- **74 existing Chromium checks passed** for basket behavior, mobile touch
  interactions, storage recovery, dialog focus, anonymous auth controls and
  branding. The combined command reached its five-minute shell limit after
  those checks, so the new suite was completed separately.
- **9 new Chromium checks passed**, covering mobile/desktop navigation, rider
  form validation and sign-in gating, all anonymous private workspace gates,
  real catalog response/empty states, and API rejection of financial callbacks
  and unauthenticated/oversized requests.
- Preview screenshots checked desktop home and the full mobile rider page.
- Proxied development API checks confirmed real catalog HTTP 200, readiness
  HTTP 200, `live_money_enabled: false`, and admin not provisioned.
- **Signed-in rendered dashboards were not verified with a real account.**
  No account was created, no interactive Google login was completed, and no
  existing user credentials were requested. Unit fixture results do not prove
  real multi-account RLS, seller foreign keys or provider integrations.
- No Daraja sandbox or live payment/payout test was run.

## What still needs implementation, configuration and approval

### Existing database and authentication

1. Obtain read-only definitions, defaults, constraints, triggers, grants and RLS
   policies for the existing Supabase tables. The eight existing marketplace
   relation endpoints and selected columns were reachable; that is not a
   privileged schema or policy audit.
2. Verify whether seller foreign keys point to `seller_profiles.id` as the
   current reader expects. Do not migrate or duplicate the existing tables
   based solely on public REST visibility.
3. Test existing email signup/confirmation/login, profile-trigger creation,
   profile updates, reload/sign-out and cross-account isolation using approved
   real test accounts. Existing account/profile functionality was preserved.
4. Verify Google OAuth end-to-end. The last recorded failure was
   `redirect_uri_mismatch`; this work did not establish that it is resolved.
   Match the Google OAuth client and Supabase provider settings, authorized
   callback URI and permitted app redirect URLs. Do not paste secrets into chat.

### Seller, customer checkout and bookings

- Implement persistent seller applications, verification document handling,
  owner approval/suspension and approved listing/order management against the
  inspected existing schema. These are **not enabled just by signing in**.
- Implement trusted server-side real-basket/order creation, prices, currency,
  stock/availability reservations, per-seller shipment grouping and idempotent
  checkout. The original basket remains explicitly a **sample preview** and
  is not silently converted to paid inventory.
- Add a verified commission ledger, seller/rider balance states, transaction
  histories, refunds and reconciliation. Existing payment records do not prove
  a functioning accounting system.
- Booking history is a reader only. Services, travel/stays availability,
  reservation/cancellation workflows and both seller-supplied and external
  supplier inventory still need integration and testing.
- Digital upload security, entitlement checks and short-lived authorized
  downloads remain unimplemented.

### NexaHub Delivery

- Inspect any existing rider/delivery structures, including differently named
  or non-public structures, before proposing exact additive schema changes.
  Common rider/delivery REST relation names were not exposed; that alone is
  not proof of absence in every schema.
- Approve service areas, verification requirements, privacy/retention policy,
  delivery charge rules, rider/platform shares, cancellation and dispute rules.
- Implement private rider verification storage, admin review, seller-owned
  confirmed-order requests, verified-rider atomic acceptance, assigned-rider
  transitions and order-linked event history.
- Implement secure server-issued OTPs: short expiry, hashing, rate limits,
  attempt limits, single-use verification and an approved SMS/email delivery
  channel. Never expose the customer's code to the rider.
- Implement real milestone tracking, notifications, verified delivery accounting
  and operational dispute management. No live map/location is claimed.

### Safaricom Daraja

- The STK/callback endpoints are **disabled scaffolding, not an implemented
  provider client**. Add sandbox-only server-side OAuth/STK/query calls,
  durable pending attempts, idempotency and verified reconciliation before
  any checkout can collect money.
- Sandbox setup needs the approved Daraja application, Consumer Key/Secret,
  test shortcode/passkey, test phone support, public HTTPS callback and
  appropriate API product permissions. Request secret values through the
  workspace's secure configuration flow, never frontend files or chat.
- Implement Safaricom's current trusted-ingress/callback-origin controls,
  authenticate provider status queries, correlate checkout/merchant/order IDs,
  amount/currency and receipt, reject duplicates/forgeries and reconcile
  delayed/missing callbacks. A JSON success field or STK acknowledgement is
  **not** sufficient proof of payment.
- Production requires Safaricom approval for the existing Paybill/M-PESA
  Express product, production credentials/passkey, required account/settlement
  arrangements and explicit owner approval following successful acceptance
  tests. Keep sandbox and production separate.
- Payouts require approved B2C disbursement/account arrangements, enabled API
  permissions, initiator/security-credential certificate setup, owner approval
  controls, durable idempotency, result/timeout handling and reconciliation.
  Split Payments requires its own Safaricom-approved contract; ordinary STK is
  not assumed to split money.
- **Live checkout and live payouts remain off regardless of credentials.**
  No Stripe, Whop or Shopify integration was added.

### Launch checks

Persistent pagination, abuse/rate limiting, authorization tests with real roles,
privacy/compliance documents, transactional notifications, production hosting,
monitoring, reconciliation alerts, backups/recovery, accessibility and relevant
cross-browser tests are still required. This status document must not be used
as a production-readiness sign-off.

## Local verification commands

```sh
npm run test:backend
npm test
npx playwright test tests/platform.spec.js
```

The full browser suite may exceed a five-minute tool timeout. Run it as a
background job or in completed file-based batches rather than interpreting a
timeout as a passing complete run.
