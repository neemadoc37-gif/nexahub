---
name: NexaHub visible implementation priorities
description: User direction on visible implementation versus planning documents and completion claims.
---

For NexaHub, stop creating more planning documents. Compare approved features
with actual code and prioritize accessible navigation, buttons, dashboards and
working routes in the existing website.

**Why:** The user said they had approved and discussed many features but could
not see most of them on the actual website.

**How to apply:** Explain what is actually visible and working, what is hidden
in code, and what is missing, then implement missing visible connections.
Show the actual pages in Preview. Do not claim a feature is complete because a
page or design document exists, and preserve existing work and configurations.

Use the approved professional NexaHub logo throughout the actual website; do
not substitute a different logo.

**Why:** The user explicitly required the approved logo, not a replacement.

**How to apply:** Reuse the approved artwork for the shared header, homepage,
authentication screens, role dashboards and browser icon. Preserve its
proportions and verify desktop and mobile rendering.

Do not request repeated screenshots or schema exports. Use the information
already provided and continue implementing the approved design directly on the
existing website. If a missing detail is essential, identify exactly what is
needed and why in one request. Do not create another SQL query, repeat schema
inspection, run migrations or change database permissions without approval.

**Why:** The user explicitly stopped the repeated inspection requests.

**How to apply:** Work within confirmed schema information, state unverified
security and relationship details as blockers, and seek approval before any
further database inspection or changes.

The approved customer-facing direction is a colorful international marketplace:
clean white backgrounds, dark navy or charcoal navigation and text, with soft
pastel pink, sky blue, lemon yellow, lavender, mint and peach accents. Keep the
approved NexaHub logo, name and “Your World. One Hub.” tagline. Use a consistent
visual theme across shopping, digital products, services, travel and seller pages.
Admin must remain private and role-protected; customers must not see internal
dashboards.

**Why:** The user requested this pastel redesign directly on the existing
website, replacing the earlier ivory/teal direction without a separate demo.

**How to apply:** Preserve existing data, authentication and functionality while
implementing the design in the actual pages. Keep privileged navigation out of
public customer surfaces; never trust editable profile metadata for admin access.

Preview checks must use the exact public address shown to the user, including
its explicit port, rather than only localhost or the default development domain.

**Why:** A local screenshot and the default public address worked while the
user's explicit-port Preview returned a proxy 502.

**How to apply:** Check the page, assets and API through that precise public
address before declaring Preview fixed. Account for external port mappings,
not only the server's internal listening port.

Recheck port mappings after workflow or publishing configuration changes.
These operations have restored a stale default-port mapping and an unused
additional port despite an earlier explicit-port Preview correction.

**Why:** NexaHub's explicit `:5000` Preview needs external port 5000, whereas
Autoscale publication requires the single app port forwarded to external 80.
Treating these as interchangeable caused a healthy server to appear unavailable.

**How to apply:** Finish configuration changes before verifying the user's exact
Preview address. Preserve that address during development; switch to the required
single external-80 mapping deliberately when preparing the actual publication.
