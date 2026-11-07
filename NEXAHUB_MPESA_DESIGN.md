# NexaHub M-PESA payment design and readiness

Status: proposed design, not an implemented or live payment integration.

## Confirmed scope

Use the owner's existing Kenyan Paybill through Safaricom Daraja for customer
STK Push payments. Do not connect Stripe, Whop or Shopify at this stage.
Calculate commissions server-side, expose seller-specific accounting, and
require owner approval before any payout. Payout execution requires an approved
Safaricom B2C/one-account or specifically contracted Split Payments arrangement.
No real money or live checkout until testing and explicit approval.

## Existing implementation inspected

- `index.html`: client-side sample basket and preview-checkout notice only.
- `server.py`: GET/HEAD storefront and explicit branding assets only; no payment
  POST handlers, Daraja token requests, STK initiation or callback processing.
- No commission ledger, seller balance/history UI, payout approval dashboard or
  payout executor was found in the application.
- Existing `payment_transactions`, `orders`, `order_items`, `seller_profiles`
  and `profiles` endpoints were confirmed by the preceding read-only inspection.
  Table presence alone does not establish a functioning payment workflow.
- Common MPESA/DARAJA credential secret names were checked for existence only;
  none of the checked names was configured. No secret values were accessed.
  This does not prove credentials do not exist in the owner's Daraja account.
- No Safaricom integration connection was available in the integration search.
- Full schema, constraints, RLS and remote function definitions remain unverified;
  inspect existing objects before proposing any schema change.

## Proposed trusted payment flow

1. Customer selects real published products/services. Backend authenticates the
   customer and calculates the KES order total from authoritative inventory.
2. Persist an order and unique payment attempt before STK initiation. A retry
   must not silently issue duplicate prompts or duplicate orders.
3. Backend obtains a Daraja token using server-held consumer credentials.
   Send STK Push using approved Paybill settings, phone number, reference and
   server-calculated amount. The customer enters their PIN only on M-PESA.
4. Store MerchantRequestID/CheckoutRequestID. An accepted request is pending,
   not paid. Persist callback notifications durably before acknowledging them.
5. Validate callbacks against pending requests and expected amounts/phone
   metadata, enforce unique receipt/reference handling and defend against replay.
   A JSON ResultCode of zero alone is not proof of callback authenticity.
6. Apply Safaricom's current callback-origin controls at a trusted ingress; never
   trust a client-supplied forwarded IP header. If origin cannot be verified, do
   not finalize based solely on the callback. Use authenticated STK status query
   and transaction/statement reconciliation as appropriate. No assumed webhook
   signing secret or invented signature scheme.
7. Atomically settle the verified payment and post balanced accounting entries.
   Keep cancelled, failed, timed-out and unverified attempts separate. An unknown
   outcome must remain unresolved until reconciled, not be automatically retried.
8. Calculate commission once per order line/seller using a versioned agreed
   policy. Use decimal/integer accounting, explicit rounding, tax/fee allocation
   and reversal entries for refunds; never browser-supplied commission values.
9. Seller dashboard shows only that seller's ledger and pending, available,
   reserved-for-payout and paid amounts. These are accounting balances, not
   separate M-PESA wallets or proof of Safaricom-held seller subaccounts.
10. Owner reviews payout requests, recipient verification and available funds.
    Approval atomically reserves the amount; reject overspending/concurrent
    double approval. Record who approved, when and what was approved.
11. A backend worker sends only approved payouts through the contracted product,
    using unique originator/conversation references. Safaricom API B2C execution
    is not inherently subject to NexaHub owner review: enforce it in NexaHub.
12. Mark payout paid only after verified final provider result/reconciliation.
    A timeout is not permission to resend; query the original transaction first.

Logical accounting/events/approval records must be mapped to existing tables
and functions first. This document does not prescribe duplicate new tables.

## Required configuration and approvals

### Sandbox STK Push
- Daraja developer account and sandbox app with M-PESA Express access.
- Sandbox Consumer Key, Consumer Secret, STK passkey, test shortcode and
  provider-supported test phone/configuration.
- Public HTTPS backend callback endpoint and separate sandbox configuration.
- Known order prices, commission rate/basis, fee allocation and cancellation policy.
- Secure database access and verified customer/seller/owner authorization.

### Live collection, only after sandbox acceptance and owner approval
- Existing Paybill verified as authorized for this marketplace collection model.
- Daraja Go Live onboarding linking the app to the correct Paybill; M-PESA
  organization Admin/Business Manager access and required business verification.
- Production Consumer Key/Secret and M-PESA Express passkey for the approved shortcode.
- Approved live products, callback configuration, production hosting and monitoring.
- Written confirmation from Safaricom of marketplace collection/settlement terms,
  including seller funds, fees, limits and any restrictions. Owning a Paybill does
  not itself establish those permissions.

### Seller payouts
- Safaricom-approved B2C Bulk Disbursement account/shortcode or approved conversion
  to a one-account arrangement capable of receiving and disbursing.
- B2C product enabled on the Daraja app and appropriate API initiator roles.
- API InitiatorName and encrypted SecurityCredential generated using the
  environment-correct Safaricom public certificate. No initiator password in UI.
- HTTPS ResultURL and QueueTimeOutURL, status-query permission and reconciliation.
- Approved funding/transfer mechanism between collection and disbursement
  accounts, recipient verification, transaction limits and applicable charges.
- If Split Payments is selected: direct Safaricom confirmation of availability,
  commercial approval, onboarding, supported beneficiaries, technical API
  contract and settlement/callback rules. Standard STK Push is not assumed to
  split a payment, and B2C is not assumed to be Split Payments.
- Commission rate, refund/charge allocation, hold period, payout schedule and
  owner-approval rules must be supplied before balances/payouts are operational.

Consumer secrets, passkeys, initiator credentials and tokens belong only in
secure server configuration; never request them in ordinary chat. A shortcode
and endpoint URLs are configuration, not substitutes for merchant approval.

## Acceptance before live enablement

- First test calculation, authorization, replay and failure logic locally with
  clearly labeled test fixtures; these are not real provider confirmations.
- Exercise actual Daraja sandbox STK/callback/query behavior and approved payout
  sandbox flows. No real funds are required for sandbox testing.
- Cover cancellation, insufficient funds, late/missing/forged/duplicate callbacks,
  mismatched amount/reference, unknown status, concurrent retries and refunds.
- Verify seller isolation, owner-only approval, ledger conservation, rounding,
  payout reservation and no duplicate disbursement after timeout/restart.
- Review production readiness and obtain explicit owner approval for live
  enablement and separately authorized live acceptance transactions.
- Keep checkout/payout execution disabled until the relevant gate passes.

## Official references consulted

- https://developer.safaricom.co.ke/apis/GettingStarted
  (Go Live, callback/IP controls, security-credential certificates)
- https://developer.safaricom.co.ke/apis/MpesaExpressQuery
  (authenticated STK status query; submission versus processing result)
- https://developer.safaricom.co.ke/apis/BusinessToCustomer
  (B2C approval, one-account option, initiator credentials, asynchronous result,
  role requirements, unique references and timeout reconciliation)

Some public M-PESA Express initiation pages did not render full documentation
through the fetch tool. The app-specific Daraja configuration and any Split
Payments contract must be verified in the owner's portal, not inferred.
