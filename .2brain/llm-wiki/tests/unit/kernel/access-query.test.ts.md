---
source: tests/unit/kernel/access-query.test.ts
sha256: 498712d9204ee39130c289b25b011c34f84937033855f3fe47016df8f8788b26
generated_at: 2026-09-23T20:27:02.142432+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/access-query.test.ts

## Purpose

Unit tests for `accessibleFilter` (from `@kernel/access/query`), the compiled access-control filter a Mongoose collection is actually read with. The suite pins two invariants that were previously implicit in four hand-written query fragments: an unrestricted role produces `{}` (narrows nothing), and a caller with no applicable rule produces CASL's `EMPTY_RESULT_QUERY` (matches nothing) rather than `undefined` (no restriction at all).

## Key elements

- **`describe('accessibleFilter', …)`** — single test suite covering eight scenarios:
  - **Admin / unrestricted** → returns `{}`; explicitly asserts `{}` (not `undefined`) so callers spreading the filter into a query cannot conflate "no conditions" with "no rules."
  - **Customer reading `Product`** → `{ active: true, deletedAt: null }`.
  - **Customer (owner-scope) reading `Order`** → `{ userId: Types.ObjectId(…), deletedAt: null }`; verifies the filter carries an `ObjectId`, not the raw hex string.
  - **Operator with no rule for the subject** → `{ $expr: { $eq: [0, 1] } }` (CASL `EMPTY_RESULT_QUERY`).
  - **Anonymous (`undefined`) caller reading `Order`** → same empty-result sentinel.
  - **Anonymous caller reading `Product`** → still gets the public `{ active: true, deletedAt: null }` catalogue filter.
  - **Manager reading `Product`** → asserts `tenantId` is *absent* from the serialized filter.
  - **Write action (`'update'`)** → same rules engine; manager gets `{}`, customer gets the empty-result sentinel.

## Relationships

- **`src/kernel/access/query.ts`** — provides the sole function under test, `accessibleFilter(caller, subject, action?)`.
- **`tests/support/callers.ts`** — supplies the `asAdmin()`, `asManager()`, `asCustomer(id?)`, and `asOperator()` fixture factories used to construct typed caller objects for each scenario.

## Notes

- `{}` and `{ $expr: { $eq: [0, 1] } }` are **semantically opposite** to a Mongoose query (match-all vs. match-none) but look similarly "empty." The tests exist precisely to keep those two outcomes from being swapped.
- Owner-scope filtering requires a `Types.ObjectId` in the filter; passing the caller's hex string instead would silently match zero rows. The test asserts the concrete `ObjectId` instance.
- The `tenantId` absence check uses `JSON.stringify(…).not.toContain('tenantId')` rather than a structural assertion, because the field must not appear *at all*—an explicit `tenantId: undefined` would serialize to `{}` and pass a naive `toEqual` check while still being semantically wrong.
- The write-action test (`'update'`) confirms `accessibleFilter` is action-aware and that a single rules artefact drives both read and write paths without separate filter logic.
