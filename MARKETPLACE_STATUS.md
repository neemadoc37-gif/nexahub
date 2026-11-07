# NexaHub marketplace status

## Audit of the imported project

The application consists of `index.html` (styles, storefront, and browser
logic) and a small Python standard-library server. There is no marketplace
order, payment, booking, seller, or admin backend in the imported code.

### Existing functionality preserved
- NexaHub branding and "Your World. One Hub." tagline.
- Responsive storefront and navigation.
- Search and category filtering over sample listings.
- Browser-persisted sample basket, removal, totals, and clear-basket controls.
- Explicitly labeled preview checkout and seller/service/travel placeholders.

### Account stage added
- Supabase email/password registration and sign-in calls.
- Google OAuth initiation using Supabase.
- Session restoration and sign-out.
- Email password-recovery request and recovery-password form.
- Customer profile read/edit UI aligned to existing `profiles.display_name`
  and `profiles.phone`, filtered by the authenticated user's ID.
- A repaired, tested post-merge setup hook.

These account flows are implemented in code but **not verified end-to-end
with a real customer inbox or Google account**. The owner confirmed the
marketplace migration is applied; it must not be repeated. Existing profile
policies and the auth-user provisioning trigger need read-only verification.
No user accounts or transactions were fabricated for testing.

## Configuration and checks

Read-only calls confirmed the existing Supabase Auth settings endpoint
responds, email signup is allowed, and Google is enabled. This does not prove
OAuth credentials, redirects, email delivery, or signed-in authorization work.
The app is aligned to the existing `profiles` schema without changing the
database. Google OAuth initiation redirects to Google with the expected
Supabase callback, but the real browser then receives `redirect_uri_mismatch`.
The Google Cloud OAuth client's authorized redirect URI must be corrected;
completed consent/callback remains unverified.

JavaScript syntax, Python compilation, HTML IDs, desktop/mobile storefront
rendering, and the post-merge hook have been checked. The signed-in profile UI,
automatic profile creation, and cross-account authorization still need live validation.

The anonymous-account browser tests passed at desktop (1280px) and phone
(402px) sizes with the real SDK and no mocked sessions or created accounts.
Real signup, email delivery, and authenticated profile creation/editing have
not been tested. The read-only `supabase/verify-auth.sql` check is needed to
inspect existing profile policies and provisioning without rerunning DDL.

## Remaining build stages before launch

1. **Finish account validation:** verify existing RLS/provisioning, allow preview/published
   redirects, configure production email delivery, and verify email/Google,
   confirmation, recovery, reload, sign-out, and two-account isolation.
2. **Sellers and real inventory:** seller applications, verification,
   role-protected seller dashboards, listing creation/editing, moderation,
   inventory, currency, shipping, and product images.
3. **Commerce and payments:** server-validated prices and inventory,
   durable orders, international and Kenyan M-Pesa provider configuration,
   verified/idempotent webhooks, refunds, commissions, seller payouts,
   tax/shipping rules, and reconciliation. Never trust browser totals.
4. **Digital fulfillment:** private file storage, purchase entitlement checks,
   and short-lived authorized download links issued by a backend.
5. **Services and travel:** real provider/accommodation listings,
   availability, booking concurrency, cancellations, and refunds.
6. **Administration and launch hardening:** verified admin roles, customer/
   seller/product/order/transaction management, audit logs, monitoring,
   security tests, accessibility checks, legal policies, backups, and real
   end-to-end testing of payment, fulfillment, and booking outcomes.

The marketplace is **not production-ready** at this stage. No live payment,
booking, secure download, seller verification, or admin feature is claimed.
