---
source: src/modules/cart/tests/unit/audit.test.ts
sha256: 9555d8b7242e126da0122196745f3df90c1df8889c33ea86414ce7fbfdf432ca
generated_at: 2026-09-23T18:34:12.764929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/audit.test.ts

## Purpose

Guards the cart audit action strings as a **wire contract**. These values are consumed by external log-query tooling and alert rules, not merely by in-repo consumers, so renaming a constant would compile cleanly yet silently break downstream observability. This test pins every value verbatim and uses whole-object equality to catch additions or removals of actions.

## Key elements

- **`describe('the cart audit vocabulary', …)`** — single suite scoping the contract to `cartAuditActions`.
- **`it('spells every action exactly as the log tooling expects', …)`** — asserts `toEqual` against the exact literal object `{ USER_CART_ITEM_REMOVED: 'user.cart.item_removed', USER_CART_REORDERED: 'user.cart.reordered' }`, so both key names *and* string values must match, and no extra keys may exist.

## Relationships

- **`src/modules/cart/audit.ts`** (imported via `../../audit`) — the sole dependency. Provides the `cartAuditActions` object whose shape and values this test freezes. Any change to that object (new action, renamed action, changed string) will fail this test.

## Notes

- The test intentionally checks **string values**, not just key names. A refactor that keeps the key but changes the dot-separated string (e.g. `user.cart.item_removed` → `user.cart.item.removed`) will fail here even though TypeScript is happy.
- Whole-object `toEqual` means adding a third action to `cartAuditActions` also breaks this test — the owner must consciously update the expected object, making the contract change explicit.
- There is no mocking; the test imports the real production object. If `audit.ts` ever adds side effects at import time, this test would surface them, but currently it is a pure data assertion.
