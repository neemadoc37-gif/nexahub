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
The basket resets on refresh. Sign-in, seller registration, service enquiries,
bookings, and checkout are explicitly previews, not live services.

The page loads the Supabase JavaScript SDK from jsDelivr and initializes the
existing external Supabase client, but currently makes no database or auth
requests. Existing external service configuration has not been changed.
Live authentication, payments, bookings, and persistence require separate work.
