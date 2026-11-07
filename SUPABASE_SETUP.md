# Supabase authentication setup

The storefront uses the existing Supabase project URL and **publishable** client
key in `index.html`. Publishable keys are intended for browser use; never put a
Supabase secret or service-role key in this file. Profile reads and updates are
restricted by row-level security to the signed-in customer's own record.

## 1. Create the profile table and security policies

In the Supabase Dashboard for this project, open **SQL Editor**, review
`supabase/migrations/202611070001_customer_profiles.sql`, and run it. The
migration extends the existing `profiles` table without deleting profile data,
enables row-level security, replaces existing profile policies with
owner-only rules, and creates profile rows when new users register. It also
backfills missing profiles for existing Auth users. Review the policy
replacement before applying it if you have other trusted server-side code that
depends on existing `profiles` policies.

Do not grant anonymous users access to customer profiles. Do not add a service
role key to the web app.

## 2. Configure email/password

In **Authentication → URL Configuration**, add the Replit preview origin and
your eventual published site origin to the allowed redirect URLs. The app
uses the current origin for confirmation, reset, and OAuth return URLs. In
**Authentication → Providers → Email**, choose whether new registrations
require email confirmation and configure a production email sender before
launch.

## 3. Configure Google sign-in

In **Authentication → Providers → Google**, enable Google and add the OAuth
client ID and secret in Supabase. In Google Cloud Console, register the
Supabase-provided callback URL as an authorized redirect URI. Add the preview
and published origins to Supabase's allowed redirect URLs. Keep the Google
client secret in Supabase, not in this repository.

## 4. Verify before launch

Test registration with a real email inbox, email confirmation, sign-in,
password reset, Google sign-in, profile save and reload, sign-out, and
authorization boundaries using two separate accounts. Confirm one account
cannot read or update the other's profile. These external-provider and live
email flows cannot be fully verified until the project owner completes the
dashboard setup above.
