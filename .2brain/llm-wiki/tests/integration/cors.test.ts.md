---
source: tests/integration/cors.test.ts
sha256: 236e9547f048b4b1e6f222f01c6bb6a96f24126a5e117e52a05bf770a0b9d5fa
generated_at: 2026-11-14T23:12:25.779997+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration test that pins down the app's CORS contract: a disallowed origin must be answered normally (200, route still executes) with the `access-control-allow-origin` header simply omitted, never by throwing into the Express error chain and producing a 500. It also verifies `Vary: Origin` correctness, preflight behavior, the set of pre-cleared request headers, and the `expose-headers` list for credentialed cross-origin callers. It drives the real app through the shared test harness so middleware ordering is exercised, not a privately-assembled stack.

## Key elements

- **`ALLOWED_ORIGIN`** – First entry of `NODE_CORS_ORIGIN` (env), falling back to `http://localhost:8080`. Read at module scope so the test asserts the *configured* origin, not a stale hardcode.
- **`DISALLOWED_ORIGIN`** – Constant `https://evil.example.com`; guaranteed to be outside any real allowlist.
- **Allowed-origin reflection** – `GET /` with a valid `Origin` returns 200 and echoes the origin in the allow header.
- **Disallowed-origin no-error** – `GET /` with a bogus `Origin` still returns 200 + `body.status === 'ok'`, and the allow header is `undefined`.
- **`Vary: Origin` (parametrized, `it.each`)** – Present for allowed, disallowed, *and* no-origin requests.
- **`Vary: Origin` dedup** – When `cors` adds its own, the app's extra copy must not produce a duplicate; expects exactly one `Origin` token.
- **No 5xx on a real endpoint** – `POST /account/login` with a wrong password and a disallowed origin returns < 500.
- **No-origin passthrough** – `GET /` without an `Origin` header returns 200; no allow header (correct: nothing to reflect).
- **Disallowed preflight** – `OPTIONS /account/login` returns 204, no allow header, no error.
- **Preflight header allow-list** – `antibot-challenge-token`, `analytics-consent`, `session-passive` must appear in `access-control-allow-headers`.
- **`If-Match` / `ETag` pair** – `If-Match` pre-cleared for PATCH; `ETag` in `access-control-expose-headers`.
- **Credentialed expose-headers (parametrized, `it.each`)** – `location`, `content-disposition`, `idempotent-replayed`, `ratelimit`, `ratelimit-policy` are exposed; `cache-status` is explicitly **not** exposed.

## Relationships

- **`tests/support/http.ts`** – Provides the `api()` Supertest harness; every request in this file goes through it to exercise the real Express middleware chain.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to seed/prepare the database before any test runs.

## Notes

- The file header documents *why* the no-error contract matters: `cors`'s `callback(new Error(...))` path would throw into the Express error handler, turning a valid request into a generic 500 and letting any caller inflate the 5xx rate with a single `Origin` header.
- The `Vary: Origin` dedup test exists because the app adds `Vary: Origin` unconditionally while `cors` adds it only on reflection; without dedup a browser could cache a disallowed-origin response under the same key as the real frontend's.
- `cache-status` is deliberately excluded from `expose-headers` (RFC 9211 §6: visible to devtools/curl regardless).
- Preflight tests target `OPTIONS /account/login` specifically: it is a single `OPTIONS` handler that answers *after* the `cors` middleware, making it the path where a throw would have gone unnoticed.
- `ALLOWED_ORIGIN` uses `.split(',', 1)[0]` to pick only the first entry of a potentially comma-separated env value, keeping the assertion to a single origin.
