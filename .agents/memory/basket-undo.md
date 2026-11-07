---
name: Basket undo decisions
description: Recovery behavior when basket edits happen during the undo window.
---
Undo restores only the latest removal or clear and merges removed quantities into the current basket rather than replacing it with an older snapshot. Another tab's basket update dismisses pending local recovery.

**Why:** Replacing the whole basket would silently discard subsequent shopping edits; retaining recovery across another tab's changes could resurrect items that tab intentionally removed.

**How to apply:** Preserve later edits and the basket size limit when extending removal recovery. Broader cross-tab conflict resolution is separate work.
