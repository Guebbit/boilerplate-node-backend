---
source: src/modules/users/tests/unit/routes.test.ts
sha256: e2536e3619b74beda1dc529ef48c8882fe274db62b14aa7ec8defcc928db2b58
generated_at: 2026-09-27T15:40:25.988257+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit tests that verify the user-administration router (`@modules/users/routes`) is mounted correctly: the exact endpoint set and order, per-endpoint authorization guard ordering, cache-header semantics, and upload-middleware attachment. The file exists to catch regressions where a route is added without the identity guard + key assertion, mounted above the shared `router.use(getAuth, isAuthOrCredential)` gate, or accidentally exposed to public or shared-cache paths.

## Key elements

- **`ALL`** — Ordered list of all 11 documented endpoint signatures (`POST /search` … `DELETE /:id/2fa`); the single source of truth for `it.each` iteration.
- **"what is mounted" block** — Asserts `routeSignatures(router)` equals `ALL` exactly, and that `/search` appears before `/:id` (Express param-matching reachability).
- **"authorization" block** — For every endpoint, asserts the guard chain contains `getAuth` → an identity guard (`isAuthOrCredential`) → `requirePermissionGuard` in that strict order. A separate test asserts zero endpoints lack `requirePermissionGuard` (no public reads).
- **"caching and uploads" block** — Asserts GET endpoints carry `privateNoCache` (RFC 9111 §3.5) and never a `setCache*` entry; POST endpoints carry `noStore`; three mutation endpoints include `upload.image` + `validateUploadedImages` + `quantineUploadedImages`; `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while the other two DELETE routes are not.
- **`jest.mock` × 3** — Replaces the cache, route-flag, and upload middlewares with lightweight stubs from `@tests/routes` so the router can be imported without side effects.

## Relationships

- **`src/modules/users/routes.ts`** — The file under test. Imported as `router`; all assertions inspect its middleware chain and mounted routes.
- **`tests/support/routes.ts`** — Provides the structural inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the three mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) consumed by the `jest.mock` calls.

## Notes

- Guards are asserted **per endpoint**, not once at the router level. A route mounted *above* the shared `router.use(getAuth, isAuthOrCredential)` line would still pass a single "guards exist" check but fails here because its individual chain lacks the guard.
- The identity guard is specifically `isAuthOrCredential`, not a bare `getAuth` — the user directory is a tenant surface that an API key may sync against, so the guard must accept credential-based auth.
- The `/search`-before-`/:id` test is a *reachability* guard: Express matches `/:id` first if order is wrong, silently swallowing `/search`.
- The module doc-block at the top of the file is the authoritative spec for the invariant the tests enforce; read it before modifying the router.
