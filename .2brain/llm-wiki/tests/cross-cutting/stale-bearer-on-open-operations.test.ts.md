---
source: tests/cross-cutting/stale-bearer-on-open-operations.test.ts
sha256: 4751fe031f52eba6328cbdb2e0f43c95b617133857ab45bade86894d9c345446
generated_at: 2026-11-08T09:33:07.172998+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/stale-bearer-on-open-operations.test.ts

## Purpose

Guarantees that every operation whose OpenAPI contract declares `security: []` still answers a client holding a stale (unresolvable) bearer token — i.e., the auth middleware must not short-circuit those routes with a 401 `invalid_token` challenge. The exempt set is read dynamically from the bundled spec so new open endpoints are covered automatically.

## Key elements

- **`openOperations`** – Derived at module-load time from `openapi.yaml`: every `(method, path)` pair whose operation object has `security: []`. Path parameters (`{id}`) are replaced with a fixed UUID-shaped string so the URL is routable.
- **`STALE_BEARER`** – A hard-coded `Bearer stale.bearer.token` value that no token resolver accepts (not a JWT, not an `sk_` key).
- **`INVALID_TOKEN`** – The exact `WWW-Authenticate` header value (`Bearer error="invalid_token"`) that `getAuth` returns for a rejected bearer.
- **Sanity check test** (`finds the open operations…`) – Asserts the spec parsed to a non-empty list and that `/account/login` is present, preventing a vacuous pass.
- **`it.each` test** (`does not challenge %s with invalid_token`) – Sends `STALE_BEARER` to every open operation and asserts the response does **not** carry the `invalid_token` challenge.
- **Canary test** (`is the same bearer that a sign-in-accepting operation refuses`) – Hits `/products` with the same bearer and asserts 401 + `invalid_token`, proving the token is genuinely rejected and the `it.each` cases are meaningful.

## Relationships

- **`tests/support/http.ts`** – Provides the `api()` helper used to issue HTTP requests against the mounted app.
- **`tests/support/paths.ts`** – Exports `REPO_ROOT`, used to resolve the path to `openapi.yaml`.
- **`tests/support/setup-test-db.ts`** – Called once at module scope to provision a test database before any test runs.

## Notes

- The exempt-operation list is **not** hard-coded; it is derived from the spec at load time. Adding a new `security: []` operation to `openapi.yaml` automatically adds a test case.
- The canary test is load-bearing: without it, a bearer that was never actually invalid would pass every `it.each` case silently.
- `openOperations` replaces `{param}` segments with a 24-char zero string, which may matter if a route validator enforces UUID format.
- The `SpecDocument` interface intentionally models only the `paths → method → security` slice; the rest of the spec is ignored.
