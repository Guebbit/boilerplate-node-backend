---
source: tests/integration/kernel/session-failure-fails-closed.test.ts
sha256: 5a1485200487afb67ed9d0118c9120c6fc0072f41b74572d768e52a506e38957
generated_at: 2026-11-14T23:17:15.437909+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/session-failure-fails-closed.test.ts

## Purpose

Verifies the fail-closed contract of the authentication layer over real HTTP: when a session resolver throws (unexpected error → 500, DB outage → 503), the request must **not** silently degrade to a guest. Only an explicit resolver "miss" yields a 401 `invalid_token`. Exercises `getAuth`, `isAuth`, the two stream-cookie guards, and the global error handler together, with only the resolver faked.

## Key elements

- **`fromBearer` / `watchCookie`** – `jest.fn` mocks injected via `registerAuthResolver`; simulate the three resolver outcomes (throw, 503-named error, `{ miss }`).
- **Express `app`** – real Express instance with five routes (`/public`, `/protected`, `/account/login`, `/stream/session`, `/stream/permission`) wired to the real middleware stack (`getAuth`, `isAuth`, `requireSessionViaCookie`, `requirePermissionViaCookie`) and terminated by `handleUncaughtError`.
- **`describe('a session that cannot be resolved')`** – six assertions covering bearer-token paths: unexpected throw → 500 (both public & protected), outage → 503, miss → 401 (with `WWW-Authenticate` header check), and security-open route still 200.
- **`describe('a stream cookie that cannot be resolved')`** – parameterized (`it.each`) over both stream routes, asserting the same 500 / 503 / 401 triad via the `__Host-session` cookie.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – source of `getAuth`, `isAuth`, `requireSessionViaCookie`, `requirePermissionViaCookie`; these are the middleware units under test.
- **`src/kernel/authentication.ts`** – source of `registerAuthResolver`; the test calls it once at module load to swap in the faked resolver before any request runs.
- **`src/app/error-handling.ts`** – source of `handleUncaughtError`; mounted last on the Express app, it is the component that converts resolver rejections into 500/503 responses. The test asserts its status-code and header behavior.

## Notes

- The 503 path is triggered specifically by the error's `name` being `'MongooseServerSelectionError'` (set via `Object.assign`). Any other rejection name yields 500.
- `/account/login` is the only route that accepts a refused token (200) because `getAuth` looks up the route's OpenAPI operation and exempts it when `security: []` is declared.
- `cookieAuthenticates` is hard-coded to `false` and `clearDeadCookie` is a no-op mock; the tests never exercise the cookie-clearing branch.
- All requests go through `supertest` against a live Express instance — no handler-level unit mocking beyond the resolver itself.
