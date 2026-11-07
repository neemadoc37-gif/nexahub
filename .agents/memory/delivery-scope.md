---
name: NexaHub Delivery scope
description: User requirements and approval boundaries for adding independent rider delivery.
---

NexaHub Delivery must support independent rider registration with verification
details, a dedicated rider dashboard, and available delivery jobs that verified
riders can view and accept. Sellers request delivery after confirming an order.
Include pickup and customer delivery addresses, delivery charges, rider earnings
and NexaHub delivery commission. Required statuses: Pending, Accepted, Picked Up,
In Transit, Delivered and Cancelled.

Customers need delivery tracking and OTP delivery confirmation. Admin controls
must approve, suspend and manage riders, delivery fees and disputes. Delivery
records must link to the existing orders system.

Inspect existing code/database and report existing functionality, missing work
and required approvals before application/database changes. Do not delete,
duplicate or recreate existing tables, break marketplace/auth/payment design,
or activate real payments/payouts. Preserve NexaHub branding and professional
navy, champagne-gold and ivory design.

**Why:** The user explicitly requested this scope before implementing payments.

The user approved the proposed delivery architecture **as design only**. This
does not authorize implementation, migrations, live checkout or payouts. See
`NEXAHUB_DELIVERY_DESIGN.md` for the approved design and unresolved choices.

**Why:** The user explicitly selected “Approve design only.”

**How to apply:** Preserve the approved architecture but treat delivery as
unimplemented. Obtain separate approval for unresolved business rules and exact
application/database changes after inspection; do not assume live payout access.
