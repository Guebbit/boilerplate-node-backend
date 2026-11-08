---
source: src/modules/users/tests/unit/routes.test.ts
sha256: a1f3510897519e928c80555d6bf5aaf3a682b645d3ec5afd001899a2ee758bdd
generated_at: 2026-11-08T08:58:56.028763+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit test for the user-administration router that asserts, **per endpoint**, three invariants: the exact set and order of mounted routes, the authorization guard chain on every route, and the caching/upload middleware composition. It exists so that a route accidentally mounted above the shared `use(getAuth, isAuthOrCredential)` guard, or a missing `requirePermissionGuard`, is caught by a failing test rather than by a customer reading another tenant's data.

## Key elements

- **`ALL`** – Ordered array of every documented route signature on the users router (14 entries from `POST /search` through `DELETE /:id/hard`). Serves as the single expected-list for the mount-order test and as the iteration source for per-endpoint guard and cache assertions.
- **`jest.mock` blocks** (× 3) – Stub out `cache`, `route-flag`, and `upload` infrastructure middlewares using mock factories exported from `tests/support/routes.ts` (`cacheMock`, `routeFlagMock`, `storageMock`), so the router's middleware chain can be inspected without hitting Redis or object storage.
- **"what is mounted" block** – Asserts `routeSignatures(router)` equals `ALL` exactly and that `/search` precedes `/:id` (otherwise the literal path would be shadowed by the parameterized one).
- **`it.each(ALL)` authorization block** – For every signature, pulls the guard list via `guardsOn` and asserts the ordered triple `getAuth → identityGuard (isAuthOrCredential) → requirePermissionGuard`. A separate test confirms zero endpoints lack `requirePermissionGuard` (i.e. no public route exists).
- **"caching and uploads" block** – Verifies `GET /` and `GET /:id` carry `privateNoCache` but never a `setCache*` entry; `POST /search` carries `noStore`; write endpoints that accept avatars include `upload.image`, `validateUploadedImages`, and `quarantineUploadedImages`; and `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while `DELETE /:id` is not.

## Relationships

- **`src/modules/users/routes.ts`** – The module under test; imported as `router` and passed to every assertion helper.
- **`tests/support/routes.ts`** – Supplies all inspection utilities (`routeTable`, `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the three mock factories used by the `jest.mock` calls. This file is the only bridge between the test and the router internals.

## Notes

- The `jest.mock` factories call `jest.requireActual<typeof import('@tests/routes')>` rather than `require`-ing the real middleware directly; the test-support module re-exports them so the mock shape stays in one place.
- Authorization is asserted **per endpoint**, not once on the router, deliberately: a route mounted *above* the `router.use(...)` gate would pass a single top-level check but still fail here.
- The `ALL` array is the de-facto contract for which routes exist. Adding a new endpoint to `routes.ts` without updating this list will break the mount-order test on the next run.
- Cache assertions reference RFC 9111 §3.5 (private caching) to justify why `privateNoCache` is acceptable on an admin-only `GET` while any shared-cache (`setCache*`) header is not.
