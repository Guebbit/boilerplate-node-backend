---
source: src/modules/orders/tests/unit/domain-rules.test.ts
sha256: a2e763152cb207ea4e23a05224f3564727b905b1443dadff442e05e0ec477a5d
generated_at: 2026-10-29T04:58:38.542394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the order domain rules module. All tests are pure-function checks: no mocks, no database, no fake timers. Each rule takes arguments and returns a verdict; these tests pin down those verdicts and the reasoning behind boundary cases.

## Key elements

- **`line(quantity?)`** — local helper that produces an `OrderLineCandidate` with a resolved product (`{ price: 10 }`).
- **`checkOrderLines` suite** — verifies the rule rejects an empty line set (`reason: 'no-lines'`), accepts fully-resolved lines, rejects the *entire* set when any product is `undefined`/`null` (`reason: 'product-missing'`), and does not drop bad lines while keeping good ones.
- **`isShippedItem` suite** — confirms that an omitted or `true` `requiresShipping` reads as shipped, `false` reads as digital, and a missing/`null` product defaults to `true` (the "safe direction" for an unresolved line).
- **`isDigitalOnlyOrder` suite** — empty lines → `false`; all-digital → `true`; any single shippable line → `false`.
- **`buyerIdOf` / `isBuyer` suite** — `buyerIdOf` calls `toString()` on the id object and returns `undefined` for `null`/`undefined` buyers. `isBuyer` matches by string id, rejects a different id, and never matches an erased (null/undefined) buyer or a caller with no id.

## Relationships

- **Imports** `buyerIdOf`, `checkOrderLines`, `isBuyer`, `isShippedItem`, `isDigitalOnlyOrder`, and the `OrderLineCandidate` type from `src/modules/orders/domain/rules.ts`. Every test exercises one of those exports directly.
- A trailing comment notes that soft-delete and read-scope logic are intentionally **not** covered here; they are one-line expressions tested in `service-crud.test.ts` and `service-scope.test.ts` respectively.

## Notes

- The `it.each` block for `undefined` vs `null` products exists because the two reasons map to different downstream status codes; the tests assert they stay distinct.
- `isShippedItem` treating a missing product as *shipped* is a deliberate fail-safe for unresolved lines, not an oversight.
- `checkOrderLines` is all-or-nothing by design: an order embeds a product snapshot, so a single unresolved product invalidates the whole set rather than being silently dropped.
- `buyerIdOf` accepts any object exposing `toString()` (the test uses a spy), not just a raw string.
