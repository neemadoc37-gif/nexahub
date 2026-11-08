---
name: Spinix One Delivery scope
description: User requirements and approval boundaries for adding independent rider delivery.
---

Spinix One Delivery must support independent rider registration with verification
details, a dedicated rider dashboard, and available delivery jobs that verified
riders can view and accept. Sellers request delivery after confirming an order.
Include pickup and customer delivery addresses, delivery charges, rider earnings
and Spinix One delivery commission. Required statuses: Pending, Accepted, Picked Up,
In Transit, Delivered and Cancelled.

Customers need delivery tracking and OTP delivery confirmation. Admin controls
must approve, suspend and manage riders, delivery fees and disputes. Delivery
records must link to the existing orders system.

Inspect existing code/database and report existing functionality, missing work
and required approvals before application/database changes. Do not delete,
duplicate or recreate existing tables, break marketplace/auth/payment design,
or activate real payments/payouts. Preserve Spinix One branding and professional
navy, champagne-gold and ivory design.

**Why:** The user explicitly requested this scope before implementing payments.

The user subsequently authorized implementation of the reviewed payment and
delivery features in the existing website, including visible customer, seller,
rider, tracking and admin screens, **where safely possible**. This supersedes
the earlier design-only restriction, but does not authorize live money transfers
or uninspected database changes. Keep unresolved business rules gated.

**Why:** The user explicitly asked to implement the approved features and see
actual changes in Preview, preserving the website, database and branding.

**How to apply:** Implement independently verifiable parts without repeatedly
asking for design approval. Obtain approval for unresolved business rules and
exact schema changes after inspection. Do not represent blocked forms as saved
applications or status guides as actual tracking; do not assume payout access.

Do not make further database changes without the user's approval.

**Why:** The user explicitly required approval before further database changes.

**How to apply:** Inspection may remain read-only; present proposed database
changes and obtain approval before executing them.
