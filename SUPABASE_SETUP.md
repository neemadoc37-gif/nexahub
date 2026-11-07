# Supabase account verification

## Existing schema — do not repeat the migration

The project owner confirmed the marketplace schema has already been applied:
`bookings`, `categories`, `order_items`, `orders`, `payment_transactions`,
`products`, `profiles`, and `seller_profiles`.

Read-only API checks confirmed `profiles.id`, `profiles.display_name`,
`profiles.phone`, and `profiles.created_at`. The app now uses that existing
table. It does not use `customer_profiles`, `full_name`, or `country` database
columns. The historical customer_profiles SQL file is superseded; do not run
it for this project.

Registration sends both `display_name` and `full_name` as name metadata so the
existing database trigger can use either naming convention. The app does not
insert profile rows from the browser or create a local substitute if the
backend fails. Successful profile provisioning still needs live verification.

## Check profile security and automatic creation

Run `supabase/verify-auth.sql` in the existing project's SQL Editor. It is
read-only and reads schema/policy/trigger metadata, not customer records.
Review the results before real customer testing:

- RLS must be enabled on `public.profiles`.
- Customer read/update policies must restrict access to the current
  authenticated user, typically `auth.uid() = id`.
- Customers must not be able to grant themselves seller/admin roles by
  updating a role column or user-editable metadata.
- An enabled `auth.users` INSERT trigger should create the corresponding
  `profiles` row. Its name metadata handling needs checking against the
  existing schema.

These settings cannot be proven using the app's anonymous publishable key.
Do not modify policies or repeat migrations merely to run these checks.

## Email configuration

Email signup is enabled; public settings report automatic email confirmation
is disabled (email confirmation is required). Ensure a working email sender
and confirmation template in Supabase. Production requires a properly
configured sender and suitable rate limits.

In Authentication → URL Configuration, allow the exact origin where Preview
is opened, including a port only if the browser's actual address includes it.
The app uses `window.location.origin` for confirmation, recovery, and OAuth
returns. Add the published origin before launch; do not overwrite unrelated
existing redirect URLs or a shared project's Site URL.

## Google callback

Google is enabled. A real OAuth initiation returned HTTP 302 toward Google
with this callback:

`https://oixruhlxundtgmhzeysj.supabase.co/auth/v1/callback`

That callback must match the Google Cloud OAuth client's authorized redirect
URI. Ensure its consent screen permits the testing Google account; if the
Google app is in Testing mode, add authorized test users. Client secrets stay
in Supabase, never in frontend code.

The live browser check reached Google's OAuth error page with
`redirect_uri_mismatch`; it did not reach an email-entry form. Before testing:
open Google Cloud → APIs & Services → Credentials, select the web OAuth client
whose client ID matches Supabase's Google provider, and add the exact callback
above under Authorized redirect URIs. Save it. This is not the NexaHub Preview
URL: Google returns to Supabase, which then returns to NexaHub.

After saving, retest the Google button. Successful Google consent, callback
exchange, allowed app return URL, and profile creation remain unverified.

## Checks completed

- Both anonymous-account browser tests passed at 402px and 1280px.
- The real Supabase SDK loaded, sign-in/register controls switched correctly,
  required fields blocked empty submissions, and password-recovery requests
  were blocked when no email was entered.
- No auth POST requests, emails, new users, credentials, or transactions were
  submitted by those tests.
- Google was tested separately up to the real provider error described above.

## Real-account test checklist

Use a real inbox and a Google account controlled by the project owner; never
share passwords or session tokens in chat. Verify signup, email confirmation,
sign-in, Google consent and return, profile creation/edit/reload, sign-out,
recovery, and separation between two real accounts. No fake users or
transactions are required or created by the anonymous UI tests.
