# src/modules/cart/tests/unit/audit.test.ts

## Purpose

Pinning test for the `cartAuditActions` wire-contract strings emitted by the cart module. It asserts exact string values and the complete key set so that silent renames, additions, or removals of audit action identifiers are caught in CI before they break downstream log queries and alert rules.

## Key elements

- **`describe('the cart audit vocabulary')`** — single block scoped to the action vocabulary.
- **`it('spells every action exactly as the log tooling expects')`** — uses `expect(cartAuditActions).toEqual(…)` to assert both the exact string values *and* that no keys are missing or extra (whole-object equality). Currently pins two actions:
  - `USER_CART_ITEM_REMOVED` → `'user.cart.item_removed'`
  - `USER_CART_REORDERED` → `'user.cart.reordered'`

## Relationships

- **`src/modules/cart/audit.ts`** — sole dependency. Imports `cartAuditActions` and asserts its shape and values. This is the only test guarding that module's public contract.

## Notes

- The strings are **wire contracts**, not internal identifiers. Renaming a key (e.g. `USER_CART_REORDERED` → `CART_REORDERED`) would still type-check and pass all other tests, but would break log/alert tooling that filters on the dotted string. This test is the only safeguard against that.
- Because `toEqual` performs deep equality, adding or removing a key in `cartAuditActions` will also fail this test — no separate "no new actions" test is needed.
- When a new audit action is introduced in `audit.ts`, the expected object literal here must be updated in the same change.
