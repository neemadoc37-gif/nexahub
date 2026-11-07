# NexaHub Delivery — approved design

**Original approval:** Design only. The owner subsequently authorized safe
implementation in the existing website, preserving the database and branding.
This does not approve uninspected schema changes, live checkout or payouts.
See `NEXAHUB_IMPLEMENTATION_STATUS.md` for what is actually implemented and gated.

## Approved scope

- Independent riders register using existing Supabase accounts and submit
  verification information/private documents for admin review.
- Trusted backend approval grants rider access; editable metadata cannot grant
  privileges. Only approved, non-suspended riders may accept new jobs.
- Dedicated rider dashboard: verification, available/accepted jobs, delivery
  history and earnings.
- Sellers request delivery for their own confirmed physical-goods orders or
  shipments, with pickup/customer addresses, contacts, parcel details and
  instructions.
- Delivery records link to existing orders and relevant seller/order items;
  multi-seller orders can have separate shipments. No duplicate order creation.
  Digital-only items do not create rider jobs.
- Job acceptance is atomic to prevent two riders accepting the same delivery.
  Pre-assignment previews limit personal information; exact addresses/contact
  details are restricted to authorized participants.
- Delivery status follows **Pending → Accepted → Picked Up → In Transit →
  Delivered**, with **Cancelled** controlled by cancellation rules.
- Delivery status remains separate from commerce/payment status. Every
  transition records actor/time; delivery completion never proves payment.
- Customers track milestones and assigned rider. Completion uses a short-lived,
  single-use OTP checked server-side with attempt limits and replay protection.
  Riders cannot read the expected code. Live GPS is not included by assumption.
- Server-calculated delivery charge, rider earnings and NexaHub delivery
  commission use versioned rules and explicit rounding. Pending, available,
  payout-reserved and paid accounting amounts are distinguished; no money moves
  from merely calculating a balance.
- Admin controls approve/suspend/manage riders, fees, commissions and disputes,
  with audited exceptional cancellations/confirmation overrides. Suspension
  blocks new work and requires a safe process for active deliveries.
- Preserve existing marketplace, authentication, tested basket, approved logo,
  navy/champagne-gold/ivory direction and Safaricom Daraja payment design.

## Implementation decisions still requiring approval

1. Launch delivery areas, verification documents/criteria, permitted vehicles,
   parcel types and limits.
2. Flat/zone/distance pricing; payer; commission rate; rider share; taxes/fees;
   failed-delivery, cancellation and return charges.
3. OTP delivery channel/provider/cost and recovery/exception policy.
4. Mapping provider, live GPS scope, location consent and retention if requested.
5. Failed delivery, post-pickup cancellation, returns, disputes and earnings
   release/hold rules.
6. Exact targeted database/policy changes after privileged read-only schema
   inspection. No deleting, duplicating or recreating existing tables.
7. Separate explicit approval for any real payments/payouts after testing and
   the required Safaricom permissions.

## Inspection boundary

Read-only public API probes confirmed the existing orders/profiles/sellers/
products/payment endpoints. Tested rider/delivery-specific table names were
not exposed; that does not prove no equivalent objects exist privately or
under other names. Full columns, relationships, constraints, RLS, triggers and
functions must be reviewed before proposing database changes.

## Next permitted step

Complete the privileged **read-only** database inventory and map this design to
existing objects. Present any proposed additions and business-rule choices for
approval before application/database implementation. No credentials belong in
ordinary chat.
