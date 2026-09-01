# src/modules/cart/tests/unit/audit.test.ts

## Purpose

Locks down the exact string values of cart audit actions. These strings are a **wire contract** consumed by log queries and alert rules, so a rename would type-check cleanly and pass every other test while silently breaking observability tooling. This test asserts the values by their literal strings to catch that class of regression.

## Key elements

- **`describe('the cart audit vocabulary')`** — single test suite with two assertions.
- **`it('spells every action exactly as the log tooling expects')`** — compares `cartAuditActions` to a literal object (`{ USER_CART_ITEM_REMOVED: 'user.cart.item_removed', USER_CART_REORDERED: 'user.cart.reordered' }`) using `toEqual`, catching both value changes and actions added/removed.
- **`it('registers its actions in the app-wide union')`** — assigns one action to a variable typed `AuditAction` (the infrastructure-level union), verifying the `declare module` augmentation in `audit.ts` actually registers cart actions into that union. Runs only at type-check time; jest never executes the type assertion.

## Relationships

- **`src/modules/cart/audit.ts`** — provides `cartAuditActions` (the object under test) and contains the `declare module` augmentation that merges cart action keys into `AuditAction`.
- **`src/infrastructure/observability/audit.ts`** — defines the `AuditAction` type imported here; the second test is the compile-time check that the augmentation is effective.

## Notes

- The second test is a **type-level** check. Jest compiles the file but does not enforce the type; the real gate is the TypeScript compiler. If the `declare module` block in `audit.ts` is removed, this line fails `tsc` while jest still passes.
- Use `toEqual` (deep equality), not `toStrictEqual`, so that adding a new key to `cartAuditActions` without updating the expected object will fail the test.
- The values use dot-notation namespaced strings (`user.cart.*`), not the PascalCase constant names. Do not "clean up" the casing in the test — the string is the contract.
