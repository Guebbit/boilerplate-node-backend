---
source: src/modules/users/tests/unit/routes.test.ts
sha256: 9bcf5da88001289078579f884f3a138024661294be4f1b1e79ef42e6d97527f6
generated_at: 2026-11-14T22:40:51.542668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit test for the user-administration router. Asserts, per endpoint, that the full route table matches the documented set and order, that every route carries the correct guard chain (`getAuth` → identity guard → `requirePermissionGuard`), that no endpoint is publicly accessible, that reads are never Redis-cached, and that mutating routes handle uploads and feature-flag gating correctly.

## Key elements

- **`ALL`** – Array of the 14 documented endpoint signatures in mount order; drives every `it.each` loop so adding or removing a route breaks all suites at once.
- **`describe('user routes — what is mounted')`** – Verifies the router exposes exactly `ALL` in order, and that `/search` is declared before `/:id` (Express matches greedily; the literal path must come first).
- **`describe('user routes — authorization')`** – Per-endpoint check that `getAuth` precedes the identity guard (`isAuthOrCredential`) which precedes `requirePermissionGuard`; also asserts zero routes lack the permission guard (i.e. no public endpoint exists).
- **`describe('user routes — caching and uploads')`** – Confirms `GET` routes use `privateNoCache` (never `setCache*`), `POST /search` is `noStore`, write routes chain `upload.image` → `validateUploadedImages` → `quarantineUploadedImages`, and `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while `DELETE /:id` is not.
- **Three `jest.mock` calls** – Stub the `cache`, `route-flag`, and `upload` middleware modules by delegating to factory functions imported from the shared test-support module, isolating the router under test from real infrastructure.

## Relationships

- **`src/modules/users/routes.ts`** – System under test. The test imports `{ router }` from this module and inspects its mounted layers via the helper functions below.
- **`tests/support/routes.ts`** – Provides the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) used throughout the assertions, as well as the mock-factory functions (`cacheMock`, `routeFlagMock`, `storageMock`) that this file's `jest.mock` setup calls to replace the three middleware modules with test doubles.

## Notes

- Assertions are deliberately **per endpoint** (`it.each`) rather than a single bulk check. A route accidentally mounted *above* the shared `router.use(getAuth, isAuthOrCredential, requirePermissionGuard(...))` line will still fail the individual guard-order assertion, which a "at least one guard exists" check would miss.
- The identity guard is specifically `isAuthOrCredential` (not bare `isAuth`): the user directory doubles as a tenant-surface API-key sync target, so credential-based callers are a first-class identity here.
- The `/search`-before-`/:id` ordering test is a regression guard against a future refactor that reorders route declarations and silently shadows the literal path with the parameterised one.
