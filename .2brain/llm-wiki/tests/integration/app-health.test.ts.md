---
source: tests/integration/app-health.test.ts
sha256: 3aa3195a1eac7953f0cd0038d4d8768212e413e88c8baeed1ee047726f5338f2
generated_at: 2026-09-23T20:02:18.558388+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app-health.test.ts

## Purpose

Integration tests for the system routes (`/`, unknown-path 404, `x-request-id` handling) and the `/observability/*` routes (Prometheus metrics, SSE event stream, auth-gated sub-paths). They exercise the real application exported from `src/app.ts` through the shared supertest harness, ensuring the middleware stack actually mounted on the production app is what gets tested.

## Key elements

- **`describe('System routes')`** — asserts 200 + welcome payload on `GET /`, 404 on unknown paths, and validates the `x-request-id` echo/replacement logic (well-formed UUIDs are reflected; non-UUID values are replaced with a generated UUID to prevent log-injection).
- **`describe('Observability routes')`** — covers:
    - `GET /observability/metrics` — expects Prometheus text exposition, authenticates via a static `Bearer` token (`NODE_METRICS_TOKEN`).
    - `GET /observability/events` — SSE snapshot; logs in as an admin to obtain a `jwt` session cookie, then reads the stream with a custom parser that destroys the socket after the first `data:` line (supertest would otherwise hang on the infinite stream).
    - `it.each` over `/observability/health`, `/observability/metrics/overview`, `/observability/audit` — each must return **401** (not 404/500) without credentials, proving the auth middleware is mounted on the path.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` factory that wraps supertest around the real app instance; every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a clean database, required because the SSE test authenticates via an admin session cookie that needs a user row.
- **`src/modules/users/tests/factories.ts`** — `createAdminUser()` creates the admin record used for the SSE login; `PLAIN_PASSWORD` is the constant password the factory sets, reused in the login POST body.

## Notes

- Redis is intentionally **not** started; none of the routes under test require it.
- The SSE test uses a hand-rolled `parse` callback on the supertest request. This is a workaround for supertest's buffering behavior against an infinitely-ongoing stream — the stream is destroyed once `data: ` appears in the buffer.
- The `x-request-id` malformed-value test asserts against a non-UUID string rather than an injected CR/LF, because Node's HTTP client rejects the latter at the socket level before it reaches the server.
- The 401 assertions are deliberately specific: they must return 401 (auth middleware present) rather than 404 (path missing) or 500 (middleware error), which would mask a misconfigured mount.
