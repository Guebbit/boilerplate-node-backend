---
source: tests/integration/method-not-allowed.test.ts
sha256: fd5e7b2c8572686a1ae3b6176e6116c635a3c5d91e19843ae95d75c1e155986f
generated_at: 2026-11-08T09:42:59.742615+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/method-not-allowed.test.ts

## Purpose

Integration tests that verify the application's 405 Method Not Allowed handling: a known path hit with an unlisted method returns `405` + `Allow` header + a `problem+json` body, while unknown paths, CORS preflight, and HEAD requests are unaffected. Cites RFC 9110 §15.5.6 as the normative reference.

## Key elements

- **`ALLOWED_ORIGIN`** — Derived from `NODE_CORS_ORIGIN` (or `http://localhost:8080` fallback); taken as the first comma-separated value. Used only in the preflight test.
- **`describe('a wrong method on a known path')`** — Three cases:
  - `DELETE /shop` → 405, `Allow: GET, HEAD`, `application/problem+json`, error code `METHOD_NOT_ALLOWED`.
  - `DELETE /products/facets` → 405, confirming the pre-router guard distinguishes this literal path from the templated `/products/{id}` route (which would otherwise swallow it as a 404).
  - `POST /livez` → 405 on a system/liveness route.
- **`describe('what stays as it was')`** — Regression guards:
  - `GET /nope` and `DELETE /nope` → 404 (unknown path unchanged).
  - `OPTIONS /shop` with a valid `Origin` + `Access-Control-Request-Method` → 204.
  - `HEAD /livez` → 200 (routed through the GET handler).

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` helper used to issue raw HTTP requests against the running app (chaining `.get()`, `.delete()`, `.options()`, `.head()`, `.set()`).
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`, called at module scope to ensure a clean test database exists before any test runs.

## Notes

- The `/products/facets` case is specifically a guard against a routing bug where the `{id}` parameter of `/products/{id}` would intercept the literal word `facets`, turning a 405 into a 404. The comment in the file makes this intent explicit.
- The 405 body assertions check both the `errors[0].code` (`METHOD_NOT_ALLOWED`) and the RFC-7807-style fields (`title`, `status`, `application/problem+json` content type), so a regression in the error serializer is caught here.
- `setupTestDb()` is called once at the top level (not per-test), meaning these tests assume a single shared database reset for the whole file.
