---
source: tests/unit/kernel/access-query.test.ts
sha256: 5df381d44333b44c554f318897a757f2e5c8fd57d7b3be9858f21f4ed4648924
generated_at: 2026-10-15T13:21:22.881189+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/access-query.test.ts

## Purpose

Unit tests that pin down the two invariants a developer would otherwise have to remember by hand: an unrestricted role compiles to `{}` (narrows nothing), and a caller with no applicable rule compiles to a filter that matches nothing (`{ $expr: { $eq: [0, 1] }}`) rather than to a missing filter. Replaces the old hand-written per-collection fragments with assertions against the single `accessibleFilter` compile.

## Key elements

- **`describe('accessibleFilter')`** — asserts filter output for admin, customer, owner-scoped customer, operator, anonymous, and manager against `Product` and `Order` subjects, including write actions (`'update'`).
- **`describe('accessibleFilterFor')`** — verifies the Caller-based entry point (`accessibleFilterFor`) produces the same result as the session-based `accessibleFilter` for the same logical caller, and degrades to guest scope when `caller` is `undefined`.
- **`describe('hasAnonymousReadScope')`** — tests the comparison predicate (used by the cache middleware): true when a role's filter equals the anonymous filter, false when it is strictly wider *or* merely different (owner-scope vs. deny-all).
- **`productScope` / `orderScope`** — thin local wrappers matching the `callerScope`-shaped signature `hasAnonymousReadScope` expects.
- **`Types.ObjectId`** (mongoose) — used in the owner-scope test to confirm the compiled filter carries a real `ObjectId`, not a raw string.

## Relationships

- **`src/kernel/access/query.ts`** — the module under test. Exports `accessibleFilter`, `accessibleFilterFor`, and `hasAnonymousReadScope`, all exercised here.
- **`tests/support/callers.ts`** — supplies the role fixtures (`asAdmin`, `asCustomer`, `asManager`, `asOperator`) and the `callerAs` helper used by the `accessibleFilterFor` block.

## Notes

- `{}` (no restriction) and `{ $expr: { $eq: [0, 1] } }` (deny all) are intentionally distinct; the first two tests exist to keep them from being conflated downstream.
- The owner-scope test hard-codes an `ObjectId` to catch a regression where the filter would silently match nothing if the id stayed a string.
- The deployment is single-tenant; the tests explicitly assert `tenantId` is **absent** from the compiled filter to prevent a model that *does* store it from being accidentally filtered here.
- The `requires-module: products, orders` pragma at the top declares which domain modules' schemas/rules must be loaded before these tests run.
- `hasAnonymousReadScope` is the gate used by `infrastructure/http/middlewares/cache.ts` to decide whether a caller may share a guest cache entry — tests here are about the comparison semantics, not re-proving individual role rules.
