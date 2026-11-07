# NexaHub prioritized implementation plan

Status: implementation started; external configuration and schema inspection pending.
Based on `NEXAHUB_COMPLETION_AUDIT.md`, reviewed 7 November 2026.

## Non-negotiable constraints
- Complete the existing project incrementally; preserve data, structure and working basket/dialog features.
- Reuse the existing Supabase marketplace tables; no repeated customer-profile migration.
- No fake users, fabricated payment success, invented credentials or unapproved payouts.
- Secrets and financial/administrative authority stay in a trusted backend.
- Branding: NexaHub; “Your World. One Hub.” Premium deep navy, muted champagne gold and ivory; no flashy colours, purple or pink.
- Use approved logo assets when supplied; do not invent a replacement and call it approved.
- No production-ready claim before real end-to-end acceptance passes.

## Priority 0 — finish account security and discover existing backend contracts
1. Correct the saved Google callback in Google Cloud:
   `https://oixruhlxundtgmhzeysj.supabase.co/auth/v1/callback`.
   The supplied screenshot had a different project reference. No code change can repair Google's allowlist.
2. Review results of `supabase/inspect-marketplace.sql` and existing
   `supabase/verify-auth.sql`. Both are read-only metadata checks, not migrations.
3. Verify existing profile creation, RLS ownership, trusted roles, grants,
   relationships, constraints, indexes and any current transactional functions.
4. Improve failed/expired/cancelled auth-return handling without exposing
   provider descriptions or URL credentials; keep successful SDK processing intact.
5. Verify email confirmation/recovery delivery, redirect allowlists, Google
   consent access and session behavior with existing owner-controlled accounts.
6. Test customer isolation and role escalation denial using authorized accounts.

Acceptance: email and Google accounts can authenticate, obtain exactly one
profile, save/reload it and sign out; other customers' data remains inaccessible.
No account credentials should be sent in chat.

## Priority 1 — live catalog, seller approval and trusted role foundation
- Map existing columns and policies before writing database-dependent code.
- Backend verifies each session with Supabase and independently checks trusted
  customer/seller/owner permissions. Editable profile metadata grants no role.
- Implement persisted seller applications, owner approval and seller isolation.
- Connect product/category browsing, search, product details and seller CRUD to
  existing schema, with inventory, currency, media and publication validation.
- Preserve sample cards as non-purchasable examples until live inventory is ready;
  do not silently sell sample products.
- Establish owner-only admin entry and approval screens before exposing privileged actions.

Acceptance: approved sellers manage only their own listings; customers see only
published inventory; owner can approve/reject and audit actions.

## Priority 2 — durable orders, real checkout and approved payment providers
- Confirm operator legal country, currencies, seller countries, tax/shipping,
  commissions and payout model before choosing payment rails.
- Confirm approved international card and Kenya M-Pesa merchant/provider accounts.
  Marketplace onboarding and supported-country restrictions must be established.
- Use server-priced quotes, product IDs, atomic stock checks and order snapshots.
- Implement idempotent initiation/callback processing, verified payment status,
  receipts, transaction records, reconciliation, refunds and failure recovery.
- Add customer order history, seller fulfillment/earnings and owner transaction views.
- Calculate commissions in trusted code and execute payouts only using approved
  provider accounts and explicit operational rules.

Acceptance: no browser-supplied total or redirect marks an order paid; duplicate,
forged and delayed callbacks cannot duplicate fulfillment/payouts. Provider test
mode is labeled testing; live operation requires an approved controlled purchase
and refund/reconciliation, not invented success.

## Priority 3 — digital fulfillment, services, accommodation and bookings
- Private assets and backend-verified entitlements with expiring download links.
- Service/provider pages and date/time availability with time-zone handling.
- Travel/accommodation/event capacity and pricing only where applicable and authorized.
- Transactional reservations, expiry, double-booking protection, confirmations,
  cancellations and refund handling.

Acceptance: unpaid/unauthorized downloads are denied; concurrent bookings cannot
oversell; customer, seller and admin views agree after cancellations/refunds.

## Priority 4 — complete owner administration and operational safety
- Customer/seller/product/order/booking/payment/commission/platform management.
- Owner-only server authorization, immutable audit history, least privilege and
  safe input validation on every privileged operation.
- Monitoring, alerts, restore-tested backups, support and legal policies.
- Review actual routes; implement routes required by real workflows. Do not add
  fake endpoints merely to turn a legitimate 404 into HTTP 200.

## Priority 5 — brand refinement and release acceptance
- Apply navy/champagne/ivory while retaining existing layout and functionality.
- Approved NexaHub logo from the supplied share link is integrated in the header
  and footer, with bag-emblem favicon and Apple touch icon. Overall palette
  refinement remains outstanding.
- Run complete automated suite plus real signed-in customer/seller/admin tests.
- Verify desktop/mobile, Safari/Firefox, keyboard/screen-reader behavior and failure paths.
- Review security, session protection, rate limiting, dependency control and deployment configuration.
- Publish only after explicit user approval and all release gates pass.

## Required external inputs
1. Read-only SQL metadata results, not customer records or a database password.
2. Confirmation that Google's exact callback typo is corrected and saved.
3. Owner-controlled real account validation through private sign-in, never chat credentials.
4. Payment merchant/provider approval and business/country/payout requirements;
   credentials must use secure workspace configuration when integration is selected.
5. Trusted owner identity through an appropriate secure provisioning process
   before any owner role is granted. Approved logo artwork has now been supplied.

## Current progress
- Reviewed completion audit and current account implementation.
- Added safe auth-return error handling and regression tests; not an OAuth success fix.
- Registration messaging no longer claims a new account exists solely from a
  confirmation-required response (Supabase can obscure existing addresses).
- Added read-only marketplace metadata inspection script; not executed against
  privileged database metadata here and no schema changed.
- Verification after account changes: `npm test` passed all 70 tests in the
  current suite (Chromium). Three new tests cover expired, denied and unknown
  auth-return errors without creating users, submitting auth writes or exposing
  provider descriptions. This is not evidence of successful real account login.
- Full marketplace implementation remains open; dependent stages are not called complete.
