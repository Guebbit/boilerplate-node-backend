---
source: tests/support/http.ts
sha256: b13aaf1a12fe7976dc321e1171b1200b17ade37210ae5bb2fe501165b2c71d19
generated_at: 2026-10-15T12:58:52.367434+00:00
model: ollama:qwen3.8:27b
---

# tests/support/http.ts

## Purpose

HTTP-level test harness for the account module's contract and integration suites. It drives the fully mounted Express app (routing, middleware, auth, serialization, error handler) via `supertest` so that responses can be compared against `openapi.yaml`—something impossible when calling services or repositories directly. It exposes a small set of authentication helpers that log in through the real `POST /account/login` route rather than minting tokens by hand, ensuring tests fail if login stops issuing usable credentials.

## Key elements

- **`api()`** — Returns a fresh `supertest` agent against the single shared app instance. Every test call gets its own request context.
- **`AuthenticatedTestUser`** (interface) — The shape every `authenticateAs*` helper resolves to: `{ user, token, bearer }`.
- **`authenticateAs(role?: 'admin' | 'user')`** — Creates a user (admin or verified customer) and logs in via the real login endpoint. The two roles most tests need by name.
- **`authenticateAsRole(role: string)`** — Creates a user seeded with an arbitrary tenant role (`manager`, `warehouse`, `support`, etc.) and logs in. Used by the contract sweep that exercises every preset role.
- **`loginBearer(email, password?, body?)`** — Performs `POST /account/login` with `transport: 'bearer'` and returns a `Bearer …` string. Mode-agnostic: reads `data.token` (jwt mode) or `data.sessionToken` (cookie mode).
- **`bearerForCookie(cookie)`** — Converts a session cookie into a bearer. If the value starts with `ses_` it is used directly; otherwise it is exchanged via `POST /account/refresh`.
- **`authenticateUser(user)`** (internal) — Shared login round-trip used by both `authenticateAs` and `authenticateAsRole`.

## Relationships

- **`src/app.ts`** — Imports `createApp` to build the shared Express instance at module load. No server, Mongo, Redis, or queue is started; only the app object is created.
- **Contract tests** (`abilities`, `api`, `lifecycle`, `login-paths`, `oauth`, `reauth`, `shop`, `two-factor`) — Primary consumers. They call `api()` for raw requests and `authenticateAs` / `authenticateAsRole` to obtain authenticated sessions for role-permission and endpoint-shape assertions.
- **Integration tests** (`auth-events`, `auth-hardening`, `cookie-hardening`, `delete-account`, `device-cookie-budget`) — Consume `api()`, `loginBearer`, and `bearerForCookie` to drive multi-step flows (cookie issuance, refresh, device budget) over the HTTP surface.
- **`src/modules/account/tests/contract/support.ts`** — Sibling helper in the same directory; works alongside this file's exports for contract-test setup.

## Notes

- **Single shared app per process.** The `createApp()` result is a module-level `const`. All tests in a worker share it; there is no per-test app teardown.
- **`authenticateAs` defaults are intentional.** It stamps `verifiedAt: new Date()` and grants `customer` membership. Tests that need an *unverified* account should build their own user via `createUser({}, 'unverified')` rather than fighting the default.
- **`authenticateAsRole` uses a distinct email per role** (`{role}@example.com`) because the contract sweep authenticates several roles within one test; a repeated address would trigger a duplicate-key error.
- **Redis is optional in tests.** `getCacheValue` resolves `undefined` on any failure, so the request is treated as a cache miss—no real Redis instance is required.
- **`bearerForCookie` and `loginBearer` are mode-agnostic.** They inspect credential prefixes or response fields at runtime, so a suite does not need to know whether the app is running in `jwt` or `cookie` auth mode.
