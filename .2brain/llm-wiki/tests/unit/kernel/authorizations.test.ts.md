---
source: tests/unit/kernel/authorizations.test.ts
sha256: 8909c1b289acc9f3ac7ee60f722fa0b63d5fb701c60bfe5e3df1241da266cc60
generated_at: 2026-09-27T16:11:40.485491+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the three authorization middlewares (`getAuth`, `isAuth`, `requirePermission`) and their helpers in `src/kernel/middlewares/authorizations.ts`. The file exists to lock in the deliberately distinct failure semantics of each guard (fail-open vs. 401 vs. 403), to verify that the real response envelope reaches the client, and to confirm audit events are emitted with the correct shape—without mocking the response layer or the audit vocabulary.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces only `emitAuditEvent`; spreads the real module so `buildAuditEvent` and `coreAuditActions` stay intact. Manually reroutes `recordAudit` through the fake `emitAuditEvent` because `recordAudit` closes over its own module's real function.
- **`fromAccessToken` / `fromRefreshToken` / `fromBearerToken`** — `jest.fn` resolvers registered via `registerAuthResolver` / `registerCredentialResolver` to control what the JWT/credential boundaries return on each test.
- **`ADMIN_ONLY_KEY`** (`'apikeys.any.delete'`) — A key held only by the `admin` role; stands in for "the elevated permission" in `requirePermission` tests.
- **`makeRequest`** — Builds an Express `Request` stub with an optional `Authorization` header and pre-resolved `authContext`/`caller`.
- **`makeCookieRequest`** — Request stub carrying a `jwt` cookie for the cookie-authenticated middleware paths.
- **`makeCredentialRequest`** — Request stub shaped like `getAuth`'s `sk_…` branch (`caller` + `credentialId`, no `authContext`).
- **`makeStepUpResponseStub`** — Extends `makeResponseStub` with a `setHeader` mock needed by `requireFreshAuth`.
- **`runUntilNext`** — Helper that invokes an async middleware and resolves once `next()` is called, returning the `next` mock for assertions.
- **`describe('getTokenBearer')`** — Covers Bearer-prefix stripping, absent header, and scheme-without-token.
- **`describe('getAuth')`** — Verifies fail-open behaviour (no token, invalid token, deleted user, unexpected rejection) and fail-through-to-error-handler for infrastructure outages (`MongooseServerSelectionError` → `next(err)`).
- **`describe('isAuth')`** (truncated) — Required identification; asserts 401 on failure.
- **`describe('requirePermission')` / `requirePermissionViaCookie` / `requireFreshAuth`** — Elevation and freshness checks; 401 vs. 403 distinction; step-up header emission.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — System under test; all exported middlewares and `getTokenBearer` are imported here.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` and `registerCredentialResolver` are called at module scope to install the fake resolvers before tests run.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` is mocked; `buildAuditEvent` and `coreAuditActions` are consumed from the real module (via the `requireActual` spread).
- **`src/kernel/permissions.ts`** — `callerInScope` is used to compute the expected `request.caller` value.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `AuthContext` and `Caller` types shape the request stubs and resolver return values.
- **`tests/support/stub.ts`** — `asStub` is the universal partial-stub constructor for every object in the file.
- **`tests/support/express.ts`** — `makeResponseStub` provides the base chainable `status().json()` response mock.
- **`tests/support/callers.ts`** — `asCustomer` and `asAdmin` produce realistic caller fixtures for auth-context assertions.

## Notes

- **`recordAudit` workaround**: The mock must manually rewire `recordAudit` because that function closes over the real module's `emitAuditEvent`, making it immune to the top-level mock. Omitting this reroute silently drops audit assertions.
- **`getAuth` fail-open is intentional**: A rejected or resolved-`undefined` token must call `next()` with no error; only true infrastructure errors (e.g. `MongooseServerSelectionError`) are forwarded to `next(err)` for a 503. Tests assert both paths distinctly.
- **`caller` must be set alongside `authContext`**: The request stub sets both because the middleware under test populates both; omitting `caller` from the stub would mask drift in key resolution.
- **`authTime` is epoch seconds**: `staleRequest()` subtracts 999 s from `nowSeconds()` to fall outside any freshness tier window; the unit is seconds (matching the JWT `auth_time` claim), not milliseconds.
- **Response is real, not mocked**: Status codes asserted in tests are the ones a client actually receives; only the audit sink and JWT/DB boundaries are stubbed.
