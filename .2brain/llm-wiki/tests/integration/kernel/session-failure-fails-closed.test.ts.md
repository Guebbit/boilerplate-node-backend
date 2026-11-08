---
source: tests/integration/kernel/session-failure-fails-closed.test.ts
sha256: 3033024acd526d6800d36368ed5cfcb571ea42a95f25dfd9cb909732cfd22030
generated_at: 2026-11-08T09:41:59.329364+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/session-failure-fails-closed.test.ts

## Purpose

Verifies, over real HTTP, that a *fault* in session resolution (the bearer resolver throwing) fails closed with a 500 or 503 rather than silently degrading to guest access. A deliberate *refusal* (a `miss` result) still yields 401 `invalid_token`, except on a route whose contract marks `security: []`.

## Key elements

- **`fromBearer` (jest mock)** — stands in for the sole resolver method under test; every other resolver slot is stubbed to a static `{ miss: 'malformed' }`.
- **`registerAuthResolver({ … })`** — installs the fake resolver once so `getAuth` picks it up during the request cycle.
- **Express `app`** — three routes exercising different auth postures:
  - `GET /public` — behind `getAuth` only (no `isAuth` guard).
  - `GET /protected` — behind `getAuth` + `isAuth`.
  - `POST /account/login` — `getAuth` present but the operation is contract-exempt (`security: []`).
- **`handleUncaughtError`** — mounted as the final Express error handler; receives unexpected throws and outage errors.
- **`describe("a session that cannot be resolved")`** — six `it` cases covering: unexpected throw → 500 (protected & public), Mongoose outage → 503, `miss: 'expired'` → 401, `miss: 'malformed'` → 401 with `WWW-Authenticate` header, and `miss` on the security-open route → 200 passthrough.

## Relationships

- **`src/app/error-handling.ts`** — `handleUncaughtError` is the global handler the test mounts last; the 500 and 503 assertions confirm it catches resolver throws and maps `MongooseServerSelectionError` to 503.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` is called to inject the fake; the test relies on `getAuth` reading the registered `fromBearer` during each request.
- **`src/kernel/middlewares/authorizations.ts`** — `getAuth` runs on all three routes (drives the resolver call and the 401/500/503 branching); `isAuth` additionally rejects unauthenticated requests on `/protected`.

## Notes

- Only `fromBearer` is truly faked; `fromCookie`, `watchCookie`, `cookieAuthenticates`, and `clearDeadCookie` are inert stubs, isolating the bearer path.
- The 503 case is triggered by setting `name` to `'MongooseServerSelectionError'` on the thrown error — the error handler keys off that name, not the message.
- The security-open route test (`/account/login`) asserts a **200**, confirming `getAuth` short-circuits for contract-exempt operations even when the token is refused.
- Tests use `supertest` against a live Express instance (not isolated function calls) so the full middleware + error-handler chain is exercised.
