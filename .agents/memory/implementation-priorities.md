---
name: Spinix One visible implementation priorities
description: User direction on visible implementation versus planning documents and completion claims.
---

For Spinix One, stop creating more planning documents. Compare requested features
with actual code and prioritize accessible navigation, buttons, dashboards and
working routes in the existing website.

**Why:** The user said they had approved and discussed many features but could
not see most of them on the actual website.

**How to apply:** Explain what is actually visible and working, what is hidden
in code, and what is missing, then implement missing visible connections.
Show the actual pages in Preview. Do not claim a feature is complete because a
page or design document exists, and preserve existing work and configurations.

Use the Spinix One logo and tagline consistently throughout the actual website.

**Why:** The user changed the marketplace name to Spinix One and supplied a
navy-and-gold visual reference.

**How to apply:** Use the shared Spinix One wordmark and icon for the header,
homepage, authentication screens, role dashboards and browser icon. Preserve
their proportions and verify desktop and mobile rendering.

Do not request repeated screenshots or schema exports. Use the information
already provided and continue implementing the approved design directly on the
existing website. If a missing detail is essential, identify exactly what is
needed and why in one request. Do not create another SQL query, repeat schema
inspection, run migrations or change database permissions without approval.

**Why:** The user explicitly stopped the repeated inspection requests.

**How to apply:** Work within confirmed schema information, state unverified
security and relationship details as blockers, and seek approval before any
further database inspection or changes.

The current customer-facing direction is a premium international marketplace:
white and warm ivory with deep navy and champagne gold. Keep the Spinix One name
and “Everything You Need. All in One Place.” tagline. Use one consistent theme
across shopping, account, seller and rider surfaces.
Admin must remain private and role-protected; customers must not see internal
dashboards.

**Why:** The user supplied a new Spinix One marketplace reference and requested
its palette and design for the existing website.

**How to apply:** Preserve data, authentication and working behavior while
updating the existing pages. Keep privileged navigation out of public surfaces;
never trust editable profile metadata for admin access.

Use relevant marketplace photography rather than the “Discover closer” badge
and abstract map artwork that appeared on the homepage.

**Why:** The user said the old treatment did not fit the marketplace and asked
for more appealing pictures.

**How to apply:** Prefer authentic shopping, storefront, service and travel
imagery. Keep product cards tied to published listings; do not invent catalog
items to make the homepage look populated.

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

**Why:** Spinix One's explicit `:5000` Preview needs external port 5000, whereas
Autoscale publication requires the single app port forwarded to external 80.
Treating these as interchangeable caused a healthy server to appear unavailable.

**How to apply:** Finish configuration changes before verifying the user's exact
Preview address. Preserve that address during development; switch to the required
single external-80 mapping deliberately when preparing the actual publication.

Spinix One businesses can offer services as well as products. Customer-facing and
seller-facing language should include service providers and avoid implying that
the marketplace handles goods only. Do not present service booking as operational
until it is actually connected and tested.

**Why:** The user clarified that Spinix One includes service businesses and asked
for inclusive wording such as selections instead of a goods-only basket.

**How to apply:** Use inclusive terms in navigation, seller onboarding, selection
and checkout copy while keeping unsupported booking and payment actions clearly
disabled.
