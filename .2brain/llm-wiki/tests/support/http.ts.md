---
source: tests/support/http.ts
sha256: 3343dee1b1e941ba272f035af7f8916a898acd4153992f59749a3a726a216d99
generated_at: 2026-11-08T09:55:30.245299+00:00
model: ollama:qwen3.8:27b
---

# tests/support/http.ts

## Purpose

HTTP-level test harness that drives the fully-mounted Express app through routing, middleware, auth, serialization, and the error handler via `supertest`. It exists because unit tests exercise services and repositories directly, but only the full HTTP surface produces a response comparable to `openapi.yaml`. The shared app instance is built synchronously by `createApp()` with no server, Mongo connection, Redis, or queue running.

## Key elements

- **`app`** — module-level singleton from `createApp()`; every test in the process shares this one instance.
- **`api()`** — returns a fresh `supertest` agent bound to the shared app for a single request.
- **`AuthenticatedTestUser`** — interface (`user`, `token`, `bearer`) returned by the `authenticate*` helpers.
- **`authenticateAs(role?)`** — creates a verified `user` (default) or `admin`, logs in via `POST /account/login`, returns the `AuthenticatedTestUser`.
- **`authenticateAsRole(role)`** — same flow but seeds an arbitrary tenant role name (e.g. `manager`, `warehouse`); uses a distinct email per role to avoid duplicate-key collisions when a contract sweep logs in several roles in one test.
- **`loginCompleting(email, password, body?, options?)`** — performs the full login round-trip including the `POST /account/login/2fa` challenge when the account is MFA-armed. Returns the raw `supertest` response.
- **`loginBearer(email, password?, body?, options?)`** — wraps `loginCompleting` with `transport: 'bearer'` and extracts a `Bearer …` string; **throws** on non-200 or missing token.
- **`bearerForCookie(cookie)`** — converts a session cookie to a bearer: passes through `ses_…` ids directly, or refreshes a `jwt`-mode refresh token via `POST /account/refresh`.
- **`staleBearerFor(user, tier)`** — logs in on a frozen clock, advances the clock past the tier's `reauthWindowSeconds`, then refreshes; the resulting bearer exceeds the step-up window but is still valid. **Caller must restore the clock** (`jest.useRealTimers()`).
- **`authenticateUser`** *(private)* — shared login-by-email + bearer-extraction step used by both `authenticateAs` and `authenticateAsRole`.

## Relationships

- **`src/app.ts`** — imports `createApp()` to build the shared Express app; no server or infrastructure is started.
- **`src/kernel/config.ts`** — imports `reauthWindowSeconds` (used by `staleBearerFor` to compute the clock advance).
- **`src/modules/account/tests/contract/*.test.ts`** (account-view, api, code-delivery, lifecycle, login-paths, oauth, reauth, session-view, shop, two-factor) — primary consumers; import `authenticateAs`, `authenticateAsRole`, `loginBearer`, `bearerForCookie`, `staleBearerFor`, and `api()`.
- **`src/modules/account/tests/contract/support.ts`** — companion test-support module in the same directory; works alongside this harness.
- **`src/modules/account/tests/integration/auth-events.test.ts`**, **`auth-hardening.test.ts`** — integration suites that also import helpers from this file.
- **Sibling test-support files** — imports `cookieValue`/`setCookie` from `./cookies`, `freezeDate`/`advanceDate` from `./clock`, `armStaffAuthenticator`/`withLoginCode` from `./authenticator`, and user factories from `@modules/users/tests/factories`.

## Notes

- `authenticateAs` defaults to a **verified customer**. Tests that need an unverified account must call `createUser` with `'unverified'` themselves rather than relying on this helper.
- `staleBearerFor` **freezes the clock** and does not restore it. The caller is responsible for `jest.useRealTimers()` in `afterEach`.
- `loginBearer` throws an `Error` (with the HTTP status and response body in the message) rather than returning `undefined`, making test failures immediately visible.
- Redis is genuinely optional in this harness: `getCacheValue` resolves `undefined` on any failure, so a missing cache is indistinguishable from a miss.
- `authenticateAsRole` deliberately uses `${role}@example.com` as the email to guarantee uniqueness across roles within a single test that sweeps multiple roles.
