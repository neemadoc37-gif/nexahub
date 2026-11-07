---
name: Mobile geometry checks
description: Avoid false failures when testing wrapped inline messages in narrow dialogs.
---
Check wrapped status text through its block container; reserve center-point hit tests for controls or block elements.

**Why:** A multiline inline span's bounding rectangle includes blank areas between text fragments. Its center can hit the parent even when every line is visible, falsely reporting a covered message.

**How to apply:** When testing narrow dialog reachability, verify the message container's visibility and bounds, then independently verify that its action button is reachable. Include long unbroken names in recovery messages, not just product rows.
