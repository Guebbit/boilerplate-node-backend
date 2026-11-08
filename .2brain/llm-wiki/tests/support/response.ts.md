---
source: tests/support/response.ts
sha256: c58a0c14381ef8f80f601387a459b44a9e83ac9caeaf2ea43172c127c2f7d280
generated_at: 2026-11-08T09:58:35.988482+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response.ts

## Purpose

Test-support helpers that narrow the `ResponseSuccess<T> | ResponseReject` union returned by services. Instead of a blind `as` cast at each assertion site (which silently reads `undefined` on the wrong arm), these functions assert the branch first so a misdirected response fails on that line with a clear message.

## Key elements

- **`asSuccess<T>(response)`** — asserts `response.success === true`, then returns the value typed as `ResponseSuccess<T>`.
- **`asReject<T>(response)`** — asserts `response.success === false`, then returns the value typed as `ResponseReject`.
- Both are generic over the payload type `T` and take the full union as input.

## Relationships

- **Imports from** `src/infrastructure/http/response.ts` — the `ResponseSuccess` and `ResponseReject` type definitions.
- **Imported by** integration tests across `account`, `addresses`, `cart`, `delivery`, `example`, `notifications`, `orders`, and `payments` modules (e.g. `…/integration/service.test.ts`, `…/integration/export.test.ts`, etc.) to narrow service results before asserting on `.data` or reject fields.

## Notes

- Both functions use `expect()` (Jest) internally; they are only safe in a Jest test environment.
- The `as` cast inside each function is safe *because* the assertion runs first and throws if the arm is wrong — the cast is never reached on the unexpected branch.
- The file has no runtime side effects beyond the assertion; it exists purely for type-level narrowing in tests.
