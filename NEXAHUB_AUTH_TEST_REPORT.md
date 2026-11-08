# NexaHub customer authentication: implementation and actual test results

## Scope and preservation

The existing Supabase project, public client configuration, branding, cart and
marketplace features were preserved. No schema migration, table creation, RLS
policy change, service-role key, payment or payout operation was performed.

The currently served Preview contains real Supabase SDK registration/login
handlers. The reported “Authentication is a preview” message was not found in
the current source or the page retrieved from the development Preview.

## Implementation

- Email/password registration calls Supabase Auth `signUp`.
- Login calls `signInWithPassword`; logout calls Supabase Auth `signOut`.
- Google sign-in calls the existing Google provider.
- Password recovery requests a Supabase email and updates the password through
  the verified recovery session. An arbitrary `type=recovery` URL cannot grant
  access to the password editor.
- Profiles are retrieved from the existing `profiles` table for the current
  account. If missing, the app verifies identity with Auth and attempts an
  insert-only upsert of that account's ID and display name under existing RLS.
  It never overwrites an existing profile as part of this fallback. Policy
  failures remain visible rather than being bypassed.
- Clear signed-in/profile-ready, email-confirmation, password-reset and logout
  messages are shown. Password input is cleared after accepted authentication.
- Sign-in does not impose the new-registration password length requirement on
  existing accounts.

## Actual external-provider tests

Performed through the running Preview and the existing Supabase project:

| Test | Actual result |
|---|---|
| Auth settings | Email and Google enabled; signup enabled; email confirmation required. |
| Registration using the owner's expressly supplied test inbox | Supabase HTTP 200; returned a user with one email identity; no signed-in session issued. |
| Login immediately after that registration | HTTP 400, `email_not_confirmed`. **Successful login not established.** |
| Password-recovery email request for that inbox | HTTP 200. Acceptance is verified; inbox delivery, link return and password change are not verified. |
| Invalid login | Real Supabase HTTP 400, `Invalid login credentials`, displayed correctly; no account created by this negative test. |
| Google sign-in | Reached Google, which displayed **Error 400: redirect_uri_mismatch**. **Google login is not working.** |

The registration test password was randomly generated in process memory, never
printed or saved, and was discarded when the test ended. Use the requested
password-reset email to choose your own password; do not send it in chat.

## Isolated tests are not successful customer logins

Browser fixtures test profile retrieval, missing-profile insert-only behavior,
RLS-denial messaging, session restoration and logout UI. Fixture network traffic
is intercepted and never writes fixture users/profiles to Supabase. These checks
do **not** prove that real profile policies, confirmation links or signed-in
customer sessions work.

Anonymous controls and callback-error handling have also been exercised on
desktop/mobile. The storefront has been visually checked in Preview.

Final automated run: **11 browser checks passed**. This includes the explicitly
labelled Google redirect diagnostic, not successful Google authentication.

## Remaining configuration and acceptance checks

1. Open the confirmation/reset emails in the supplied test inbox. Confirm the
   account and use the reset flow to choose a password in the website.
2. Ensure Supabase Authentication URL Configuration permits the exact Preview
   origin used for confirmation, OAuth and recovery. An accepted email request
   does not prove its redirect destination is correct.
3. In the Google Cloud OAuth client actually used by Supabase:
   - Client ID:
     `786403845062-9tuamqbe2ngfu729tk3e2jrc6c3p6qcf.apps.googleusercontent.com`
   - Authorized redirect URI, exact lowercase spelling:
     `https://oixruhlxundtgmhzeysj.supabase.co/auth/v1/callback`
   Google still rejects this redirect in the live test. Confirm it is saved on
   that exact client, not another client. Do not share the client secret.
4. Retest authenticated login, reload persistence, real profile creation or
   retrieval, profile save and logout after email confirmation. Existing
   `profiles` policies/trigger have not been fully inspected; any failure must
   be diagnosed without weakening RLS or repeating a migration.
5. Complete Google consent/callback and password-reset return/update tests.
6. Before public launch, review SMTP delivery, provider quotas, abuse protection
   and production redirect URLs. No production readiness is claimed here.

**Status:** Real registration request verified; confirmation-gated login and
real profile persistence remain unverified; Google is externally blocked.

## Follow-up redirect diagnostics

The owner reported a 403 page while using Google sign-in, with the displayed
domain `neemadoc37-gif.github.io`. The source of that specific 403 has not been
established. No reference to that domain was found in the current application;
the GitHub Pages homepage returned 404 during inspection.

Read-only Auth diagnostics using deliberately invalid, non-user verification
tokens returned HTTP 303 to `http://localhost:3000`. Requests specifying either
the current Replit Preview origin or its `:5000` variant also fell back to that
localhost address. No real token was used and no account was confirmed by these
checks. This identifies a separate redirect configuration blocker; it does not
prove that the GitHub 403 is caused by the same issue.

The existing project's Authentication URL Configuration needs review: permit
the exact Preview return origins and use an appropriate Site URL instead of
the localhost fallback. No external settings were changed by the agent.
