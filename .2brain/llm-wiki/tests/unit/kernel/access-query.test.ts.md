---
source: tests/unit/kernel/access-query.test.ts
sha256: 302fda70d44518b7936654ef6d70b1700db69225d5b71ebe7244165a78f4a78f
generated_at: 2026-09-27T16:11:16.699573+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/access-query.test.ts

## Purpose

Unit tests for `accessibleFilter` and `hasAnonymousReadScope` in `@kernel/access/query`. They pin down the two invariants that motivated replacing four hand-written query fragments with a single rules-compiled filter: an unrestricted role narrows nothing (`{}`), and a caller with no applicable rule gets an explicit "match nothing" filter rather than an absent one.

## Key elements

- **`describe('accessibleFilter')`** — eight cases covering:
  - Admin / unrestricted role → `{}` (not `undefined`).
  - Customer on `Product` → `{ active: true, deletedAt: null }`.
  - Customer (owner-scope) on `Order` → `{ userId: <ObjectId>, deletedAt: null }`; asserts the string ID is converted to a `Types.ObjectId`.
  - Operator (no rule for `Order`) → `{ $expr: { $eq: [0, 1] } }` (CASL `EMPTY_RESULT_QUERY`).
  - Anonymous (`undefined`) on `Order` → same empty-result filter.
  - Anonymous on `Product` → guest catalogue filter.
  - Manager on `Product` → filter does **not** contain `tenantId` (single-tenant deployment).
  - Write action (`'update'`) → same compiled filter shape as the read; customer update on `Product` yields the empty-result filter.
- **`productScope` / `orderScope`** — thin wrappers around `accessibleFilter` matching the `(context?) => Filter` signature that `hasAnonymousReadScope` expects from a module's own scope function.
- **`describe('hasAnonymousReadScope')`** — four cases asserting the comparison logic used by `infrastructure/http/middlewares/cache.ts`:
  - Anonymous vs. anonymous → `true`.
  - Customer (identical guest filter on `Product`) → `true`.
  - Admin (strictly wider) → `false`.
  - Customer with a specific `userId` on `Order` vs. anonymous (neither is a superset) → `false`.

## Relationships

- **`src/kernel/access/query.ts`** — the module under test. Provides `accessibleFilter` (rules → MongoDB filter) and `hasAnonymousReadScope` (filter-equality comparison for cache sharing).
- **`tests/support/callers.ts`** — supplies `asCustomer`, `asManager`, `asAdmin`, `asOperator` fixtures that build CASL ability contexts for the test cases.

## Notes

- The "unrestricted" case asserts `{}`, not `undefined`, because the caller spreads the result into a Mongo query; the two must be distinguishable.
- The owner-scope test exists specifically to catch the silent-failure mode where a raw string ID in the filter matches zero rows.
- The `tenantId` absence test is deployment-specific: the boilerplate ships a single shop, so compiling a discriminator over a non-partitioned collection would lock everyone out.
- `hasAnonymousReadScope` tests deliberately do **not** re-prove individual role rules; they assume `accessibleFilter` is correct (verified above) and isolate the comparison semantics.
