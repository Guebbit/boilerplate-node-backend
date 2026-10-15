---
source: src/modules/users/tests/unit/routes.test.ts
sha256: ea64eb1754ef16352ccab9eb8832d94b29871ec9fed1f77fbccaf1819cf4a529
generated_at: 2026-10-15T12:16:34.626310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit-test the user-administration router (from `@modules/users/routes`) to verify that every documented endpoint is mounted in the correct order, that each endpoint carries the full identity-and-permission guard chain, and that caching/upload middleware is applied (or absent) as intended. Assertions are made per endpoint so that a route accidentally mounted above the guard `use()` still fails.

## Key elements

- **`ALL`** — Array of the ten documented route signatures (e.g. `'POST /search'`, `'GET /:id'`, …) in mount order. Serves as the single reference list for every `it.each` block.
- **`describe('user routes — what is mounted')`** — Asserts `routeSignatures(router)` equals `ALL` exactly (order-sensitive) and that `/search` is declared before `/:id`.
- **`describe('user routes — authorization')`** — For every signature in `ALL`, asserts the guard chain contains `getAuth` → identity guard (`isAuthOrCredential`) → `requirePermissionGuard` in that order. Also asserts no endpoint is unguarded.
- **`describe('user routes — caching and uploads')`** — Asserts GET reads use `privateNoCache` (no `setCache*`), POST uses `noStore`, image-mutation endpoints carry `upload.image` + `validateUploadedImages` + `quarantineUploadedImages`, and `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while plain deletes are not.
- **Three `jest.mock` calls** — Stub `cache`, `route-flag`, and `upload` middlewares by delegating to mock factories exported from `@tests/routes` (via `jest.requireActual`).

## Relationships

- **`src/modules/users/routes.ts`** — The module under test; provides the `router` that every assertion inspects.
- **`tests/support/routes.ts`** — Supplies all test helpers (`routeTable`, `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the three mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) used by the `jest.mock` calls.

## Notes

- Mocks are wired through `jest.requireActual<typeof import('@tests/routes')>` rather than inline factories — the mock implementations live in the shared support file, not here.
- The `ALL` array must stay in sync with the router's mount order; adding a new endpoint without updating it will fail the first test immediately.
- The identity-guard assertion is intentionally position-based (`indexOf` comparisons), not just membership, to enforce the `getAuth → identity → requirePermission` ordering.
