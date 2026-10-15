---
source: tests/unit/kernel/authorizations.test.ts
sha256: 75cac3712d0bdf2fe4f5de63a4651f64e16cd570d6622524c860c630dec7a32a
generated_at: 2026-10-15T13:21:50.816331+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the authorization middlewares in `src/kernel/middlewares/authorizations.ts`. The file verifies that the three-tier guard model (`getAuth` → optional, fails open; `isAuth` → required, 401; `requirePermission` → elevation, 401/403) behaves correctly at every branch boundary, using a real response layer so asserted status codes match what a client would receive. Only the audit sink and the JWT/DB resolver boundaries are stubbed.

## Key elements

- **`describe('getTokenBearer')`** — table-driven tests for Bearer-token extraction: prefix stripping, case-insensitive scheme, rejection of non-Bearer schemes.
- **`describe('getAuth')`** — the optional-identification middleware. Covers: no token (no-op), valid token (attaches `authContext` + `caller`), invalid/expired token (fails open, anonymous), valid token but deleted user (`ok: undefined`), non-infrastructure rejection.
- **Additional describe blocks** (truncated in view) — `isAuth`, `isAuthOrCredential`, `requirePermission`, `requirePermissionViaCookie`, `stillHoldsKeyViaCookie`, `requireFreshAuth`, `requireFreshAuthWhen`.
- **`makeRequest` / `makeCookieRequest` / `makeCredentialRequest`** — typed request-stub factories for bearer, cookie, and `sk_…` credential branches respectively.
- **`runUntilNext`** — helper that invokes an async middleware and resolves once `next()` is called, returning the `next` mock for assertion.
- **`makeStepUpResponseStub`** — adds `setHeader` (needed by `requireFreshAuth`) on top of `makeResponseStub`.
- **`ADMIN_ONLY_KEY = 'apikeys.any.delete'`** — a real permission key used as the elevated-permission stand-in throughout.
- **Partial mock of `@infrastructure/observability/audit`** — replaces `emitAuditEvent` with a `jest.fn()` while keeping `buildAuditEvent` and `coreAuditActions` real; includes a `recordAudit` shim so the inner call path still hits the mock.
- **Resolver injection via `registerAuthResolver` / `registerCredentialResolver`** — fakes `fromAccessToken`, `fromRefreshToken`, `fromBearerToken`, `recheckFamily`, `clearDeadCookie`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the module under test; all exported guards are exercised here.
- **`src/kernel/authentication.ts`** — provides `registerAuthResolver` and `registerCredentialResolver`; the test injects fake resolvers through these to control token-verification outcomes.
- **`src/infrastructure/observability/audit.ts`** — partially mocked; `emitAuditEvent` is stubbed, `buildAuditEvent`/`coreAuditActions` remain real to catch shape regressions.
- **`src/infrastructure/observability/security-events.ts`** — `securityEventsTotal` and `staleCredentialsTotal` counters are imported for metric assertions.
- **`src/kernel/permissions.ts`** — `callerInScope` is used to build the expected `caller` object that `getAuth` should attach.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `AuthContext` and `Caller` types shape the stubs and resolver fakes.
- **`tests/support/callers.ts`** — `asCustomer` and `asAdmin` factories produce realistic identity objects for resolver return values.
- **`tests/support/express.ts`** — `makeResponseStub` supplies the chainable `status().json()` response mock.
- **`tests/support/stub.ts`** — `asStub` creates the typed partial objects used for `Request`, `Response`, `NextFunction`, and `Caller` stubs.

## Notes

- **Fail-open is intentional and tested as a requirement.** `getAuth` must call `next()` exactly once on every path, including the invalid-token path, because it guards public routes. Tests assert `next` is called and `authContext` stays `undefined`.
- **The audit mock has a subtlety:** `recordAudit` in production closes over its own module's `emitAuditEvent`, which is immune to the outer mock. The test file re-implements `recordAudit` to route through the mocked `emitAuditEvent` explicitly.
- **`ADMIN_ONLY_KEY` is a literal permission string**, not a scope-wide shortcut. Tests that reference "the elevated permission" always use this constant.
- **`runUntilNext` resolves on `next()`**, not on middleware completion — a middleware that forgets to call `next` will hang the test (intentional, mirrors the production contract).
- **Response is real (not mocked at the status-code level):** the test asserts the exact numeric status a client receives, so the middleware's own `res.status(…).json(…)` calls are exercised.
