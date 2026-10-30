---
source: tests/integration/kernel/session-failure-fails-closed.test.ts
sha256: 2233f54b15f240252c78577bfca885675eea6958aeaad10f11116cc776892253
generated_at: 2026-10-29T06:58:24.993308+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/session-failure-fails-closed.test.ts

## Purpose

Integration test proving that a session-resolver failure (an unexpected rejection) fails **closed** — producing 500 or 503 — rather than failing open as an anonymous guest. It exercises the full HTTP stack (Express → `getAuth` → `isAuth` → global error handler) with only the resolver faked, guarding against regressions where a rejection would fall through to `next()` and yield a misleading 401/"session expired" to the client.

## Key elements

- **`fromBearer`** (jest mock) — the sole faked unit; each test controls what the resolver does with a bearer token (reject with a generic error, reject with `MongooseServerSelectionError`, or resolve to a `{ miss }` shape).
- **`registerAuthResolver({ … })`** — injects the fake resolver (plus no-op cookie stubs) so the real auth pipeline runs against it.
- **Express `app`** — two routes under test:
  - `GET /public` — behind `getAuth` only (no `isAuth`), representing a route that permits guests.
  - `GET /protected` — behind `getAuth` + `isAuth`, representing a route that requires a valid session.
- **`app.use(handleUncaughtError)`** — the global error handler that converts an unhandled resolver rejection into the correct HTTP status.
- **`describe('a session that cannot be resolved')`** — five cases:
  1. Unexpected rejection on `/protected` → **500**.
  2. Unexpected rejection on `/public` → **500** (not a silent 200-as-guest).
  3. `MongooseServerSelectionError` rejection → **503** (outage).
  4. `{ miss: 'expired' }` on `/protected` → **401** (legitimate refusal).
  5. `{ miss: 'malformed' }` on `/public` → **200** (legitimate guest).

## Relationships

- **`src/app/error-handling.ts`** — provides `handleUncaughtError`, the terminal Express error middleware that inspects the rejection and maps it to 500 or 503. The test's whole point is verifying this path is reached.
- **`src/kernel/authentication.ts`** — provides `registerAuthResolver`, the injection point the test uses to swap in the fake `fromBearer` while keeping the rest of the auth pipeline real.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth` (invokes the resolver) and `isAuth` (enforces a resolved session). The test exercises both to confirm the fault propagates through the middleware chain rather than being swallowed.

## Notes

- The `fromCookie` / `watchCookie` / `clearDeadCookie` stubs resolve to `{ miss: 'malformed' }` and are never triggered; they exist only to satisfy the resolver interface.
- The distinction under test: a **miss** (resolver resolved, token is bad/absent) is a normal client condition → 401 or guest; a **rejection** (resolver threw) is a server fault → 500/503. Mixing these up was the previous bug.
- `MongooseServerSelectionError` is the single rejection type mapped to 503; all other errors are 500.
- The mock is cast `as never` to satisfy TypeScript's stricter return type on `registerAuthResolver` without importing the internal resolver type.
