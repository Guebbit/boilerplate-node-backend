---
source: tests/unit/kernel/access-query.test.ts
sha256: a6d915a99d92df0ac3e0348d578101ad6c752be66af96ce4bea72416fab520ef
generated_at: 2026-11-08T10:26:12.734507+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/access-query.test.ts

## Purpose

Unit tests for the access-query kernel (`src/kernel/access/query.ts`). The file pins two invariants that replace four previously hand-written filter fragments: an unrestricted role compiles to `{}` (never `undefined`), and a caller with no applicable rule compiles to CASL's empty-result query (never a missing filter). It also verifies the `Caller`-based entry point and the anonymous-read comparison used by the HTTP cache middleware.

## Key elements

- **`describe('accessibleFilter')`** — 9 cases covering: admin (unrestricted → `{}`), customer (scoped to `active`/`deletedAt`), owner-scope reads (userId as `ObjectId`, not string), no-rule callers (→ `{ $expr: { $eq: [0, 1] } }`), operator-as-customer parity, anonymous reads, tenant-discriminator exclusion, and write-action compilation (`'update'`).
- **`describe('accessibleFilterFor')`** — 3 cases asserting the `Caller`-based API returns identical filters to the session-based `accessibleFilter` for the same effective role.
- **`productScope` / `orderScope`** — thin wrappers adapting `accessibleFilter` to the `(context) => filter` signature that `hasAnonymousReadScope` expects.
- **`describe('hasAnonymousReadScope')`** — 4 cases on the comparison logic itself: anonymous-vs-anonymous is true; a role whose filter is *identical* to the guest's is true; a role that is *wider* is false; a role whose filter merely *differs* (owner-scoped orders vs. guest's empty result) is also false.

## Relationships

- **`src/kernel/access/query.ts`** — the module under test; exports `accessibleFilter`, `accessibleFilterFor`, and `hasAnonymousReadScope`.
- **`tests/support/callers.ts`** — provides the caller fixtures (`asCustomer`, `asManager`, `asAdmin`, `asOperator`, `callerAs`) that simulate resolved session/API-key contexts for each role.

## Notes

- The `requires-module: products, orders` header comment signals this test file depends on those Mongoose models being registered (likely for schema-side effects or `Types.ObjectId` context).
- The tenant-discriminator assertion uses `JSON.stringify(...).not.toContain('tenantId')` rather than a structural check, because the field must be entirely *absent* from the compiled filter — its presence would silently lock out all users on a non-partitioned collection.
- The ObjectId case (`asCustomer('507f…')`) is specifically a regression guard: if the kernel ever passes the userId string through without conversion, the filter matches zero rows, which is a "missing restriction wearing the opposite disguise."
- `hasAnonymousReadScope` tests compare *equality of the compiled filter*, not set-superset logic: a customer's order scope (`{ userId, deletedAt }`) is neither a superset nor a subset of the guest's empty result, and the function must still return `false`.
