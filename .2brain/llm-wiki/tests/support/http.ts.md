---
source: tests/support/http.ts
sha256: 3343dee1b1e941ba272f035af7f8916a898acd4153992f59749a3a726a216d99
generated_at: 2026-10-29T07:08:24.970029+00:00
model: ollama:qwen3.8:27b
---

# tests/support/http.ts

## Purpose

HTTP-level test harness that drives the Express application through real routing, middleware, auth, serialization, and error handling — the only layer where a response can be compared against `openapi.yaml`. Unit suites call services and repositories directly; this file exists so contract and integration tests exercise the full request/response cycle via Supertest.

## Key elements

- **`app`** (module-level) — the single shared Express instance built by `createApp()` from `src/app.ts`. No server is started, no Mongo/Redis/queue connections opened; only `boot`/`start` would do that.
- **`api()`** — returns a fresh `supertest` agent bound to the shared `app` for a single request.
- **`AuthenticatedTestUser`** — interface holding `{ user, token, bearer }` returned by the `authenticate*` helpers.
- **`authenticateAs(role)`** — creates a user or admin (verified, customer membership) via the user factories, then logs in through `POST /account/login`. Returns `AuthenticatedTestUser`.
- **`authenticateAsRole(role)`** — same flow but with an arbitrary tenant role string; generates a distinct email per role to avoid duplicate-key collisions when a contract sweep tests many roles in one test.
- **`loginCompleting(email, password, body?, options?)`** — performs the full login, including the second 2FA step (`POST /account/login/2fa`) when the account is armed with an authenticator. Returns the raw `supertest` response.
- **`loginBearer(email, password?, body?, options?)`** — wrapper around `loginCompleting` that requests `transport: 'bearer'` and extracts the token (JWT or `ses_…` session id). Throws a descriptive `Error` on failure.
- **`bearerForCookie(cookie)`** — converts a session cookie to a `Bearer` header. Auto-detects the mode: `ses_…` prefixes are used directly; otherwise the cookie (a refresh token) is exchanged via `POST /account/refresh`.
- **`staleBearerFor(user, tier)`** — logs in on a frozen clock, advances the clock one second beyond the given tier's `reauthWindowSeconds`, then refreshes. The resulting bearer carries the original `auth_time`, simulating a stale-but-valid session. **Freezes the clock**; caller must call `jest.useRealTimers()` in `afterEach`.
- **`authenticateUser(user)`** (private) — shared login round-trip used by both `authenticateAs` and `authenticateAsRole`.

## Relationships

- **`src/app.ts`** — imports `createApp()` to build the shared app instance at module load.
- **`src/kernel/config.ts`** — imports `reauthWindowSeconds` to compute how far past a tier window `staleBearerFor` must advance.
- **`./cookies`** — imports `cookieValue` and `setCookie` for cookie parsing and extraction from responses.
- **`./clock`** — imports `freezeDate` and `advanceDate` used by `staleBearerFor`.
- **`./authenticator`** — imports `armStaffAuthenticator` and `withLoginCode` for TOTP challenge resolution in `loginCompleting`.
- **`@modules/users/tests/factories`** — imports `createUser`, `createAdminUser`, `PLAIN_PASSWORD` for user provisioning.
- **Contract & integration tests** (`src/modules/account/tests/contract/*.test.ts`, `src/modules/account/tests/integration/*.test.ts`) — the primary consumers; they import `api`, `authenticateAs`, `authenticateAsRole`, `loginCompleting`, `loginBearer`, `bearerForCookie`, and `staleBearerFor` to drive HTTP assertions.
- **`src/modules/account/tests/contract/support.ts`** — sibling support module in the same directory; likely provides contract-specific fixtures or helpers that build on this harness.

## Notes

- **One app for the whole process.** `createApp()` is called exactly once at import time. Tests share the same Express instance and therefore the same in-memory Mongo (from `setupTestDb()`); isolation is at the data level, not the app level.
- **Redis is absent by design.** `getCacheValue` resolves `undefined` on failure, which the app treats as a cache miss — no Redis instance is required in the test environment.
- **`staleBearerFor` mutates the global clock.** The caller is responsible for restoring it (`jest.useRealTimers()`) in `afterEach`; the helper itself does not.
- **`loginBearer` is transport-agnostic.** It always requests `transport: 'bearer'`, so the response carries a usable token regardless of whether the app is in `jwt` or `cookie` mode. Tests do not need to know which mode is active.
- **`authenticateAsRole` defaults to verified.** The only exception is the literal role name `'unverified'`, which sets `verifiedAt: undefined`. Tests that need an unverified user should either pass that role or build the user themselves with `createUser({}, 'unverified')`.
- **2FA is armed by default in `loginCompleting`.** Pass `options.arm = false` to sign a staff account in without first enrolling an authenticator app (e.g., a suite that enrolls the app itself).
