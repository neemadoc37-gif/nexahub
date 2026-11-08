---
name: Preview static asset updates
description: Static file responses in the Spinix One Preview are captured by the server when it starts.
---

After editing static HTML or CSS, restart the application before interpreting a browser test as a code failure.

**Why:** The running server continued serving its startup-time asset snapshot after files changed, so tests saw stale CSS until the workflow restarted.

**How to apply:** Restart the existing application workflow once after a batch of static asset edits, then verify the served asset content and rerun focused UI tests.
