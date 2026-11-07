# Website integration contract

Existing application: plain `index.html`, Supabase SDK global
`nexahubSupabase`, current auth state `currentUser`; preserve all original
functions/IDs and eight sample cards. New UI script must use a separate file,
`assets/platform.js`, and stylesheet `assets/platform.css`, served explicitly.

Use same-origin `/api/...` requests. For protected routes obtain current
Supabase access token via `nexahubSupabase.auth.getSession()`, attach
`Authorization: Bearer ...`; never put tokens in URLs, DOM or logs. The server
validates each token with Supabase Auth, then adds explicit ownership filters.
`{error:{code,message}}` is the error format, no silent fallback data.

## Public reads
- `GET /api/readiness` -> `{payments:{enabled:false,reasons:[...]},
  delivery:{enabled:false,reasons:[...]},rider_registration:{enabled:false,reasons:[...]},
  seller_writes:{enabled:false,reasons:[...]},admin:{configured:boolean},
  live_money_enabled:false}`. This is configuration status, not fake metrics.
- `GET /api/catalog` -> `{products:[{id,title,description,price,currency,image_url,
  category_id,seller_id,status}],categories:[{id,name,slug}]}`
  Only published products are exposed. Empty data means no published inventory,
  not sample fallback. Optional `q` search (max120 characters).
- `GET /api/catalog/{uuid}` -> `{product:{...}}`, 404 if not published.

## Verified customer reads
- `GET /api/customer/orders` -> `{orders:[{id,status,total_amount,currency,created_at}],
  limit:50}`
- `GET /api/customer/orders/{uuid}` -> `{order:{...},
  items:[{id,order_id,seller_id,product_id,quantity,unit_price}]}`
- `GET /api/customer/bookings` -> `{bookings:[{id,product_id,seller_id,status,created_at}]}`
- `GET /api/customer/payments` -> `{payments:[{id,order_id,provider,amount,currency,status}]}`
- `GET /api/deliveries/track?order_id={uuid}` checks customer owns order, then
  returns 503 `delivery_not_configured`. Do NOT invent delivery records,
  rider coordinates or active timeline steps.

## Verified seller reads
- `GET /api/seller` -> `{seller:{id,user_id,store_name,status,created_at}|null,
  products:[...],items:[{id,order_id,product_id,quantity,unit_price}],
  accounting_enabled:false}`. Only current user's seller profile is selected;
  products and items are explicitly scoped to that profile's ID. Empty arrays
  for an existing seller are real returned results, not fake sales/earnings.

## Rider and owner routes
- `GET /api/rider` requires auth then 503 `rider_not_configured`.
- `GET /api/admin` requires auth plus server-configured owner allowlist;
  403 when not provisioned/unauthorized. If authorized returns
  `{profiles:[{id,display_name}],sellers:[...],products:[...],orders:[...],
  bookings:[...],payments:[...],mutations_enabled:false}`.
- Never use UI role selection or editable user metadata as authorization.

## Safe blocked writes (no DB writes or provider calls)
- `POST /api/riders/applications`: auth + validate
  `{full_name,phone,city,vehicle,consent:true}` then 503 registration not configured.
  No verification document upload until private storage/schema approved.
- `POST /api/sellers/applications`: auth + validate `{store_name}` then 503.
- `POST /api/deliveries/requests`: auth + seller ownership verification +
  validate `{order_id,pickup_address,delivery_address}` then 503.
- `POST /api/payments/mpesa/stk`: auth + customer order ownership +
  validate `{order_id,phone}` then 503 `payments_disabled`. No STK prompt sent.
- `POST /api/deliveries/confirm`: auth + validate `{order_id,otp}` then 503;
  no code generated, consumed or falsely confirmed.
- `POST /api/admin/actions`: owner authorization then 503 writes not enabled.
- `POST /api/payments/mpesa/callback`: 503, never changes payment state.
- `GET /api/delivery/estimate`: 503, fee/commission policy not configured.

## UI requirement
Visible destinations: Customer account/orders/bookings/payments; live catalog
and product detail; Seller dashboard/application/delivery request; Rider
application/dashboard; Delivery tracking/OTP form; M-PESA checkout readiness;
Admin restricted controls.
Show loading/error/empty/configuration-blocked states explicitly. Forms may
validate fields but MUST say not saved when the backend returns blocked.
Application drafts are in-memory only. Never store ID documents or private
addresses in localStorage.

Do not convert sample cart to a paid order. Keep old sample checkout behavior
and its tests intact; add a separate clearly discoverable real-order payment
screen. All monetary values use provided currency, no invented earnings/rates.
New routes may use query parameter `?workspace=customer|seller|rider|delivery|
payments|admin|catalog`, not URL hash, to avoid disrupting Supabase callbacks.
Public page shells are viewable signed out but private data requires auth.
Navigation into the platform should be visible on the home page and header.
