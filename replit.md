# NexaHub

## Run on Replit
- Click Run to start the `Start application` workflow.
- The command is `python3 server.py`, serving on `0.0.0.0:5000`.
- Open Preview to view the storefront.
- No package installation or additional secrets are needed for this preview.

## Project scope
The imported site remains in `index.html`, including its existing CSS and
JavaScript. `server.py` uses only Python's standard library and serves only
the storefront, not workspace files. Refresh Preview after editing the HTML;
responses are not cached.

Search, category filters, dialogs, and the sample basket are client-side.
The sample basket persists in this browser and is not a live order.

Customer email/password and Google authentication use the existing Supabase
project. Apply the SQL migration and provider setup in `SUPABASE_SETUP.md`
before relying on account profiles or Google sign-in. The browser contains
only Supabase's public publishable key; never add a service-role or provider
secret to frontend code.

The customer account UI uses `customer_profiles`, not the legacy `profiles`
table. This is intentional: the existing external table has a different
schema, and its full purpose and policies have not been verified. Do not
replace or alter it just to match the new account form.

## Product requirements
- Preserve the imported NexaHub branding, design, and working features.
- Keep the tagline: "Your World. One Hub."
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
