---
source: src/modules/orders/tests/unit/domain-rules.test.ts
sha256: 1096d547389a3ee3174080ce1ae80a7b8b331e5deef0cd7ecd3083ac0e09ff9b
generated_at: 2026-09-23T19:13:15.524304+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the `checkOrderLines` domain rule. Verifies that the rule correctly accepts or rejects a set of order-line candidates based on whether every product has resolved, without any mocks, database, or fake timers.

## Key elements

- **`line(quantity?)`** — local factory returning an `OrderLineCandidate` with a resolved product (`{ price: 10 }`); used to build valid fixtures inline.
- **`describe('checkOrderLines')`** — test suite covering four scenarios:
    - Empty array → `{ ok: false, reason: 'no-lines' }`.
    - All lines have resolved products → `{ ok: true }`.
    - A line whose `product` is `undefined` or `null` → `{ ok: false, reason: 'product-missing' }` (parameterized via `it.each`).
    - One bad line among valid ones → whole set rejected (snapshot semantics: you can't drop a line and keep the rest).

## Relationships

- **`src/modules/orders/domain/rules.ts`** — sole dependency. The test imports `checkOrderLines` (the function under test) and the `OrderLineCandidate` type used to shape fixtures.

## Notes

- The module doc comment states the testing contract explicitly: no mocks, no DB, no fake timers — the rule is a pure argument-in / verdict-out function.
- The two failure reasons (`no-lines`, `product-missing`) are asserted to stay distinct because they map to different HTTP status codes downstream.
- A trailing comment documents what is _deliberately excluded_ from this file: the soft-delete toggle and the read scope both live in `service.ts` and are covered by `service-crud.test.ts` and `service-scope.test.ts` respectively. Don't add those cases here.
