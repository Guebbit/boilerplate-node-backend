---
source: src/modules/orders/tests/unit/domain-rules.test.ts
sha256: 9e37e61d4e8a5eafbbc02745e10b16fafe6aa59109359df9b27586e25ed23827
generated_at: 2026-09-27T15:20:52.672146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the order-domain rule functions in `domain/rules.ts`. The tests are pure — no mocks, no database, no fake timers — because the rules under test are plain functions that take arguments and return verdicts.

## Key elements

- **`checkOrderLines` tests** — Verifies that an empty line set is rejected with reason `'no-lines'`; that valid lines (resolved products) pass; and that any line with a missing/`null` product rejects the *entire* set with reason `'product-missing'` (one bad line poisons the whole order snapshot).
- **`isShippedItem` tests** — Confirms the default: a line with no `requiresShipping` field (or a missing product) is treated as shipped (`true`); `requiresShipping: false` is digital (`false`). The "missing product → shipped" case is documented as the safe direction for an unresolved line.
- **`isDigitalOnlyOrder` tests** — Empty line set returns `false` (nothing to call digital); all-digital lines return `true`; a single shippable line makes it `false`.
- **Trailing comment** — Explicitly scopes out soft-delete and read-scope tests, pointing to `service-crud.test.ts` and `service-scope.test.ts` as their homes.

## Relationships

- **Imports** `checkOrderLines`, `isShippedItem`, `isDigitalOnlyOrder`, and the `OrderLineCandidate` type from `src/modules/orders/domain/rules.ts`. This is the sole dependency; the test exercises that module in isolation.

## Notes

- The `line()` helper at the top is a tiny factory (`{ quantity, product: { price: 10 } }`) used to construct valid candidates without repetition.
- `checkOrderLines` returns a discriminated union (`{ ok: true }` | `{ ok: false, reason }`); the two `reason` strings map to different HTTP status codes upstream, so the tests deliberately keep them distinct and assert on the exact string.
- The "missing product → shipped" behavior in `isShippedItem` is a deliberate fail-safe, not a bug. If it ever feels wrong, the comment in the test marks it as intentional.
- Soft-delete and read-scope logic is *not* in the domain layer; it lives in `services/crud` and `services/scope` respectively, and is tested in their own test files. Do not look for those cases here.
