# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the authorization middlewares in `src/kernel/middlewares/authorizations.ts`. Verifies that each middleware (`getAuth`, `isAuth`, `isAdmin`, `getTokenBearer`, `isAdminViaCookie`, `requireFreshAuth`) honours its contracted failure mode—fail-open vs fail-closed—returns the correct status code and response envelope, and emits the correct audit event. Only the audit sink and the JWT/user-lookup boundary are stubbed; the response path is exercised for real so asserted status codes match what a client would receive.

## Key elements

- **`getTokenBearer` tests** — header parsing: strips `Bearer` prefix, returns `undefined` for absent header or bare-scheme header.
- **`getAuth` tests** — optional identification: always calls `next()` exactly once; never sets a response status; attaches `authContext` on success; defaults `admin` to `false` via `?? false`; proceeds anonymously on expired token, deleted user, or lookup failure.
- **`isAuth` tests** — required identification: demands *both* an `authContext` and a Bearer token; returns 401 with a generic `{ success: false, status: 401 }` envelope; emits a `SECURITY_UNAUTHORIZED` audit event on rejection, nothing on success.
- **`isAdmin` tests** — required elevation: passes admin through; distinguishes 401 (no credentials at all) from 403 (known non-admin); both bodies stay generic.
- **`isAdminViaCookie` / `requireFreshAuth` / `requireFreshAuthWhen` tests** (truncated in sample) — cookie-based auth and session-freshness guards.
- **`fromAccessToken` / `fromRefreshToken`** — `jest.fn` pair registered via `registerAuthResolver`; the entire auth-resolver contract (rejection = bad token, `undefined` resolution = valid token, no user) is faked here.
- **`makeRequest` / `makeCookieRequest` / `makeStepUpResponseStub`** — minimal Express request/response stubs built with `asStub`.
- **`runUntilNext`** — helper that invokes an async middleware and resolves a promise when `next()` is called, returning the `next` mock for assertions.
- **Partial mock of audit** — `jest.mock` spreads `requireActual` so `buildAuditEvent` and `coreAuditActions` stay real; only `emitAuditEvent` is replaced.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the module under test; all exported middlewares are imported and exercised.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` is called at module scope to inject the fake `fromAccessToken`/`fromRefreshToken` pair, replacing the production resolver for the duration of the test.
- **`src/infrastructure/observability/audit.ts`** — partially mocked; `emitAuditEvent` is a `jest.fn` whose calls are asserted; `coreAuditActions` (the action vocabulary) and `buildAuditEvent` remain real so shape mismatches surface here.
- **`tests/support/express.ts`** — provides `makeResponseStub` used across all response assertions.
- **`tests/support/stub.ts`** — provides `asStub`, the generic helper used to build every request, response, and `NextFunction` stub in this file.

## Notes

- **Partial mock discipline:** `jest.mock('@infrastructure/observability/audit', …)` spreads `requireActual` first, so only `emitAuditEvent` is replaced. If the real `buildAuditEvent` output shape drifts, tests here will fail before production does.
- **Resolver contract is binary:** a *rejection* means "bad/expired token" and a *resolved `undefined`* means "valid token, no matching user." These must stay distinguishable in the fake or `isAdminViaCookie`'s 401-vs-403 mapping breaks.
- **`getAuth` never responds:** it is identification-only; any `res.status`/`res.json` call would be a bug. Tests assert this explicitly.
- **`isAuth` requires both conditions:** an `authContext` without a Bearer token is still a 401. This prevents a populated request object from standing in for a credential.
- **`admin` normalisation:** `getAuth` tests that a missing `admin` field is coalesced to `false` (not left `undefined`), because `isAdmin` and downstream `callerScope` logic branch on the value.
- **`nowSeconds()`** returns epoch *seconds* (not ms) to match the JWT `auth_time` claim; `staleRequest()` subtracts 999 s to fall outside any freshness tier.
- **`makeStepUpResponseStub`** adds a `setHeader` mock because `requireFreshAuth` calls it and the shared `makeResponseStub` does not.
