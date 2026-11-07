# NexaHub

## Run on Replit
- Click Run to start the `Start application` workflow.
- The command is `python3 server.py`, serving on `0.0.0.0:5000`.
- Open Preview to view the storefront.
- No package installation or additional secrets are needed for this preview.

## Repeatable basket checks
- Run `npm ci` once to install the locked browser-test dependencies.
- Run `npm test` (or `npm run test:basket`) to check saved baskets in Chromium.
  The runner starts `python3 server.py` if port 5000 is not already serving.
- Replit's Chromium is detected automatically. Elsewhere, run
  `npx playwright install chromium` first, or set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible Chromium executable.
- Tests use fresh browser contexts and block third-party requests; no customer
  accounts, Supabase access, or secrets are required.
- Failure screenshots and traces are written to the ignored
  `generated-artifacts/playwright/` directory.

## Project scope
The imported site remains in `index.html`, including its existing CSS and
JavaScript. `server.py` uses only Python's standard library and serves only
the storefront and explicitly whitelisted brand images, not arbitrary workspace files. Refresh Preview after editing the HTML;
responses are not cached.

Search, category filters, dialogs, and the sample basket are client-side.
The sample basket persists in this browser and is not a live order.

Customer email/password and Google authentication use the existing Supabase
project. Follow the verification and provider instructions in
`SUPABASE_SETUP.md` before relying on account profiles or Google sign-in. The browser contains
only Supabase's public publishable key; never add a service-role or provider
secret to frontend code.

The owner confirmed their external marketplace migration is applied. The
customer account UI uses the existing `profiles` table (`id`, `display_name`,
`phone`). Do not repeat the historical `customer_profiles` migration or
replace the existing database. Verify existing RLS policies and auth-user
provisioning triggers with the read-only `supabase/verify-auth.sql` script.

## Product requirements
- Preserve the imported NexaHub branding, design, and working features.
- Keep the tagline: "Your World. One Hub."
- Approved direction: premium deep navy, muted champagne gold and ivory;
  avoid bright/flashy colours, purple and pink. Preserve existing structure.
- The user supplied the approved NexaHub navy/gold bag-and-globe artwork.
  Use that branding, not an invented replacement. Prioritize secure working
  flows over cosmetics.
- Develop the global multi-vendor marketplace in stages.
- Use Supabase email/password and Google authentication.
- Use secure backend functions for sensitive marketplace operations.
- Never expose secret keys in frontend code or simulate users, payments, or
  transactions as real outcomes.
- Report configuration blockers and untested features accurately; do not call
  the marketplace production-ready until its real flows have been tested.

Seller onboarding, listings management, paid checkout, secure digital
downloads, service bookings, travel inventory, and admin tools remain
unimplemented. Do not represent the marketplace sample cards as live products
or the preview checkout as a payment.
