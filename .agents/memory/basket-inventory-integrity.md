---
name: Basket inventory integrity
description: Keep demo basket content separate from real listings and order creation.
---
Historical demo basket entries are not verified marketplace inventory. Future customer baskets and orders must be built from published listing IDs and current listing prices, never from demo basket values.

**Why:** Displaying old sample data as a real product or purchase would mislead customers about availability and pricing.

**How to apply:** When connecting the customer basket or checkout to published listings, resolve each item against current catalog data and reject stale or unpublished listings.
