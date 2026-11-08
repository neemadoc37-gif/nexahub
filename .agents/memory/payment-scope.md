---
name: Spinix One payment provider and approval boundaries
description: Owner-selected Kenyan Paybill/Daraja approach and explicit restrictions on live money and other commerce providers.
---

Use the owner's existing Kenyan M-PESA Paybill through Safaricom Daraja.
Do not connect Stripe, Whop or Shopify yet. Customer STK collections require
verified provider confirmation, platform commission accounting, seller balances
and transaction history, and owner-reviewed payout approval.

**Why:** The owner explicitly chose this approach instead of the other commerce
providers and prohibited fake confirmations or simulated transactions.

Payouts must use a Safaricom-approved B2C or contracted Split Payments arrangement.
Do not assume ordinary STK provides split settlement. Do not send real money or
enable live checkout/payouts without successful testing and explicit approval.

**Why:** The owner made provider approval, testing and authorization prerequisites.

**How to apply:** Safe visible implementation and sandbox preparation are
authorized; live money is not. Keep incomplete provider, ledger and persistence
operations visibly blocked rather than treating credentials alone as completion.
