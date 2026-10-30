---
source: src/modules/users/tests/unit/routes.test.ts
sha256: 9dd1cb16f956b9c708927cc0fc93d3067ec40706a45eb07c6230842408e8f8a3
generated_at: 2026-10-29T06:24:07.313971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit test suite that pins down the user-administration router's contract: exact endpoint set and mount order, per-route authorization guard chain, cache-header policy, and upload-validation wiring. It exists so that a new route added above the shared `use(getAuth, isAuthOrCredential)` line, or a route that silently loses its permission guard, is caught immediately rather than at review time.

## Key elements

- **`ALL`** — Array of every documented endpoint signature (method + path) in expected mount order (14 entries, `POST /search` through `DELETE /:id/hard`).
- **`jest.mock` × 3** — Replaces the cache, route-flag, and upload middleware modules with factories provided by the test-support module, so assertions inspect the middleware chain by name rather than side-effecting.
- **"what is mounted" block** — Asserts `routeSignatures(router)` equals `ALL` (exact set *and* order) and that `/search` precedes `/:id` (Express first-match routing).
- **"authorization" block** — For every endpoint, asserts the guard chain contains `getAuth` → identity guard (`isAuthOrCredential`) → `requirePermissionGuard` in that order; also asserts no endpoint lacks `requirePermissionGuard`.
- **"caching and uploads" block** — Asserts GET routes use `privateNoCache` (never `setCache`), `POST /search` uses `noStore`, write endpoints carry `upload.image` + `validateUploadedImages` + `quarantineUploadedImages`, and `DELETE /:id/hard` is gated by `routeFlag(hardDelete)` while the soft deletes are not.

## Relationships

- **`src/modules/users/routes.ts`** — The file under test; exports `router`, which is imported and inspected throughout.
- **`tests/support/routes.ts`** — Provides the inspection utilities (`routeTable`, `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the three mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) used in the `jest.mock` calls.

## Notes

- The identity guard here is `isAuthOrCredential`, **not** a plain session check — API-key tenants sync against this directory, so the test explicitly expects that specific guard name.
- Guard order is asserted (`getAuth` < identity < `requirePermissionGuard`) because `requirePermissionGuard` reads the role from context that `getAuth` populates; a reordered chain would read from an empty context.
- Caching assertions cite RFC 9111 §3.5 (private-only responses): admin-only data must never enter shared Redis; `privateNoCache` is the permitted browser-side mechanism.
- Tests run per-endpoint (`it.each(ALL)`) rather than once, so a route accidentally mounted *above* the `use(...)` line still fails its own assertion.
- `chainOf` returns the middleware chain as strings; cache mocks appear as `setCache(...)` and `privateNoCache`, uploads as `upload.image`, flags as `routeFlag(hardDelete)` — matching the names the mocks register.
