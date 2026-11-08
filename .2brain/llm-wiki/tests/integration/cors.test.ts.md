---
source: tests/integration/cors.test.ts
sha256: 8b1dfe69cf48c481ebb3d0bcd70ee58c43eba019d6157512d75e4c5b4c57d78a
generated_at: 2026-11-08T09:37:25.627851+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cors.test.ts

## Purpose

Integration tests that pin the app's CORS contract end-to-end through the real Express middleware stack. The core property under test: a disallowed origin must be answered **without** the `Access-Control-Allow-Origin` header, never by erroring the request. This catches the plausible regression of calling `callback(new Error(...))` instead of simply omitting the header, which would turn valid cross-origin calls into 500s and let anyone drive the 5xx rate.

## Key elements

- **`ALLOWED_ORIGIN`** — Derived from `NODE_CORS_ORIGIN` (first comma-separated entry) with a fallback of `http://localhost:8080`. Reading it from the env keeps the test in sync with `src/app/security.ts`'s allowlist so it doesn't accidentally assert the fallback.
- **`DISALLOWED_ORIGIN`** — `https://evil.example.com`; guaranteed to be absent from any allowlist.
- **"reflects an allowed origin back to the caller"** — Verifies 200 + matching `access-control-allow-origin`.
- **"serves a disallowed origin normally, without the allow header"** — Asserts 200, a healthy body, and header absence simultaneously (guards against the half-fix of only fixing one side).
- **"says Vary: Origin for …"** (`it.each`) — Confirms the app adds `Vary: Origin` unconditionally (allowed, disallowed, and no-origin cases).
- **"says Vary: Origin once, not twice"** — Prevents a duplicate `Origin` entry when `cors` adds its own.
- **"does not turn a disallowed origin into a server error on a real endpoint"** — Uses `POST /account/login` with a deliberately wrong password; status must be < 500 and header absent.
- **"allows a request that carries no origin"** — No-origin callers (curl, healthchecks) get 200, no allow header, no `*`.
- **"answers a disallowed preflight without the allow header, and without erroring"** — Preflight `OPTIONS` path; `cors` short-circuits before the router, so a throw here is a silent 500.
- **"allows the antibot, analytics-consent and passive-session headers through preflight"** — Verifies `Access-Control-Request-Headers` pre-clearing for `antibot-challenge-token`, `analytics-consent`, and `session-passive` (consumed by `humanChallengeGate`, `callerContextOf`, and the session guard respectively).
- **"lets a browser send If-Match and read ETag"** — Preflight must pre-clear `if-match`; the response must expose `etag`.
- **"exposes … to a credentialed browser client"** (`it.each`) — Checks `access-control-expose-headers` includes `location`, `content-disposition`, `idempotent-replay`, `ratelimit`, `ratelimit-policy` and explicitly excludes `cache-status`.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` Supertest wrapper used by every request in this file; drives the real app instance with its actual middleware order.
- **`tests/support/setup-test-db.ts`** — Called once at module load (`setupTestDb()`) to initialise a clean database before any test runs; necessary because the login test hits a real endpoint that queries the DB.

## Notes

- The `ALLOWED_ORIGIN` constant deliberately mirrors `src/app/security.ts`'s env-driven allowlist. Hardcoding `http://localhost:8080` would silently pass against the fallback even when a checkout sets `NODE_CORS_ORIGIN`, giving a false green.
- The preflight tests matter because `cors` intercepts `OPTIONS` **before** the Express router; a `throw` in that path produces a 500 with no route handler involved, making it invisible to route-level error handling.
- `Vary: Origin` is asserted on every response (allowed, disallowed, no-origin) because the app adds it unconditionally; the `cors` package only adds it when it actually reflects an origin, so without the app's own header a disallowed response could be cached under the same key as the real frontend's.
- The file-header comment references `docs/tools/security.md` as the design rationale.
