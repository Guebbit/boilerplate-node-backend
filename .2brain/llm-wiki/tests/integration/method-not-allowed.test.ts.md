---
source: tests/integration/method-not-allowed.test.ts
sha256: fd5e7b2c8572686a1ae3b6176e6116c635a3c5d91e19843ae95d75c1e155986f
generated_at: 2026-10-29T06:59:22.569493+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/method-not-allowed.test.ts

## Purpose

Integration test verifying that a known route hit with the wrong HTTP method returns **405 + `Allow` header** (RFC 9110 §15.5.6) through the real app, while confirming that 404, CORS preflight, and HEAD behavior remain unchanged.

## Key elements

- **`setupTestDb()`** — called at module scope; initializes a fresh test database before any test runs.
- **`ALLOWED_ORIGIN`** — first entry of `NODE_CORS_ORIGIN` (or `http://localhost:8080`); used as the `Origin` header in the preflight test. Derived identically to `cors.test.ts`.
- **`describe('a wrong method on a known path')`** — three cases: `DELETE /shop` → 405 with `Allow: GET, HEAD`, `application/problem+json` body, and `METHOD_NOT_ALLOWED` error code; `DELETE /products/facets` → 405 (literal path that a templated `:id` sibling would otherwise swallow); `POST /livez` → 405 on a system route.
- **`describe('what stays as it was')`** — regression guards: `GET/DELETE /nope` → 404; `OPTIONS /shop` with allowed origin → 204; `HEAD /livez` → 200 (routed through GET).

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` request helper used by every test case to issue HTTP calls against the running app.
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb()`, invoked once at file load to prepare a clean database for the integration suite.

## Notes

- The `/products/facets` case is a regression guard: without a pre-router guard the templated `:id` route would match `facets` as an id and return 404 instead of 405. The test documents that the literal-path route must win.
- `ALLOWED_ORIGIN` uses `split(',', 1)[0]` (JavaScript `String.prototype.split` with a limit), not an array slice—keep this pattern if updating the origin logic.
- The 405 response body is asserted to conform to RFC 7807 (`application/problem+json`) with `title`, `status`, and a structured `errors[0].code`.
