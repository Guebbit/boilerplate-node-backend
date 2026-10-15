---
source: tests/integration/app-health.test.ts
sha256: 43aa3450e78340d18f34361026a1553e342b35f8cb74899ca55189df8cda1ae9
generated_at: 2026-10-15T12:43:34.200033+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app-health.test.ts

## Purpose

Integration tests for the system health endpoints (`/`, `/livez`, `/readyz`) and the `/observability/*` routes. They exercise the **real** application assembled in `src/app.ts` via the shared supertest harness, deliberately avoiding a privately-built Express app so that middleware-stack mismatches cannot mask regressions. A test database is provisioned (the SSE events route requires an admin session); Redis is intentionally not started because none of these routes need it.

## Key elements

- **`setupTestDb()`** (module-level) — seeds an in-memory/test database before any test runs.
- **`describe('System routes')`** — asserts `GET /` returns a welcome payload with an `x-request-id` header, unknown paths 404, and that the server always generates its own request ID (logging any client-supplied ID beside it as `clientRequestId`). Also covers the trusted-ingress override and the malformed-UUID replacement rule.
- **`describe('GET /livez')`** — confirms the endpoint returns 200 with an empty body *while* `/readyz` is still 503, locking in the liveness semantic ("process is alive, may not be ready").
- **`describe('GET /readyz')`** — drives the readiness phase directly via `markServerListening()` / `markServerDraining()` and asserts 503 → 200 → 503 transitions, plus that `/livez` stays 200 during draining.
- **`describe('Observability routes')`** —
  - `/observability/metrics`: authenticates with a bearer token read from `currentEnvironment().NODE_METRICS_TOKEN`; asserts Prometheus text exposition.
  - `/observability/events`: logs in as an admin to obtain a `__Host-session` cookie, then reads the SSE stream via a custom supertest `parse` that destroys the socket after the first `data:` chunk.
  - `/observability/{health,metrics/overview,audit}`: asserts 401 (not 404/500) to prove auth middleware is mounted on the path.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Provides the `api()` supertest helper used for every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module load to create the test database. |
| `src/infrastructure/runtime/readiness.ts` | `markServerListening()` and `markServerDraining()` are called to transition the process through readiness phases. |
| `src/infrastructure/adapters/logger.ts` | `logger.log` is spied on to capture the structured access-log payload and assert `clientRequestId` is recorded. |
| `src/infrastructure/config/store.ts` | `currentEnvironment()` supplies `NODE_METRICS_TOKEN` for the metrics bearer header. |
| `src/modules/users/tests/factories.ts` | `createAdminUser()` + `PLAIN_PASSWORD` create the admin account used to obtain a session cookie for the SSE test. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_TRUSTED_INGRESS: 'true' })` enables the trusted-ingress code path in one test. |

## Notes

- **Test ordering is load-bearing.** The `/readyz` "still booting" case must run *first* in its `describe` block; a later case that calls `markServerListening()` would otherwise leave the process in a listening state and make the 503 assertion pass by accident. Similarly, the `/livez` block runs before any `markServerListening` call.
- **SSE stream handling.** Because `EventSource` cannot set custom headers, the test authenticates with a session cookie (mirroring the frontend's `withCredentials` approach). The infinite stream is terminated by calling `stream.destroy()` after the first `data:` chunk arrives; supertest's `buffer(true)` + custom `parse` collects whatever was received.
- **Request-ID validation test** uses a plain non-UUID string (`'not-a-uuid'`) rather than a CR/LF injection string, because Node's HTTP client rejects the latter before it reaches the server. The shape check is what actually guards the log-injection vector.
- The file's own docblock explicitly warns that driving a privately-assembled Express app (rather than the one in `src/app.ts`) is the primary anti-pattern to avoid.
