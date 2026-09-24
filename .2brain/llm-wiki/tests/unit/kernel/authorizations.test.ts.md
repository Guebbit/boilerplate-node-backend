---
source: tests/unit/kernel/authorizations.test.ts
sha256: 3623f5245e25f7469d28f4cc57fca414386e899c14ea8dd5ca14815483c6dd6f
generated_at: 2026-09-23T20:27:19.167153+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the three authorization middlewares exported from `src/kernel/middlewares/authorizations.ts` — `getAuth` (optional identification, fails open), `isAuth` (required identification, 401), and `requirePermission` (required elevation, 401 or 403). The response layer is kept real (not mocked) so that asserted status codes are the ones a client actually receives; only the audit sink and JWT/DB boundaries are stubbed.

## Key elements

- **Mock setup for `@infrastructure/observability/audit`** — `emitAuditEvent` is replaced with a jest mock; `buildAuditEvent` and `coreAuditActions` stay real so shape mismatches fail here. `recordAudit` is additionally overridden to route through the mocked `emitAuditEvent` (see Notes).
- **`registerAuthResolver` call** — installs fake `fromAccessToken` / `fromRefreshToken` resolvers so guards resolve callers without touching a real DB or JWT library.
- **`ADMIN_ONLY_KEY`** (`'apikeys.any.delete'`) — a permission key only the admin caller holds, used as the "elevated permission" throughout.
- **Request stub builders** — `makeRequest`, `makeCookieRequest`, `makeCredentialRequest`, `makeStepUpResponseStub`: minimal Express request/response objects for the header-based, cookie-based, credential, and step-up middleware paths respectively.
- **`runUntilNext`** — runs an async middleware and resolves a promise when `next()` is called, returning the `next` mock for assertions.
- **`describe('getTokenBearer')`** — prefix-stripping, absent header, and scheme-without-token cases.
- **`describe('getAuth')`** — the bulk of the file: anonymous pass-through, identity attachment (including `request.caller` via `callerInScope`), invalid/expired token, deleted user, DB failure, no-response guarantee, idempotency across two mounted routers (JWT boundary hit once), and the credential-caller branch.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the module under test; all middleware functions are imported from here.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` is the injection point; tests install fake resolvers through it.
- **`src/kernel/permissions.ts`** — `callerInScope` is used to build the expected `request.caller` value so tests assert the real key-resolution contract.
- **`src/infrastructure/observability/audit.ts`** — partially mocked (`emitAuditEvent` replaced, rest real) to capture audit side-effects without a real sink.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — `AuthContext` and `Caller` types shape the request stubs and expected values.
- **`tests/support/callers.ts`** — `asCustomer` / `asAdmin` factories produce realistic caller objects for assertions.
- **`tests/support/express.ts`** — `makeResponseStub` provides the base chainable `status().json()` stub.
- **`tests/support/stub.ts`** — `asStub` wraps partial objects into jest-compatible mocks used by every request/response helper.

## Notes

- **`recordAudit` override in the audit mock.** The middleware's `auditRefusal` helper calls `recordAudit`, which closes over its own module's _real_ `emitAuditEvent` and is therefore immune to the top-level `jest.mock` replacement. The mock explicitly redefines `recordAudit` to call the mocked `emitAuditEvent`, otherwise refusal audit events would be invisible to assertions.
- **`getAuth` must call `next()` exactly once on every path.** A missed `next()` hangs the request; the tests assert `next` was called and `response.status` was _not_ — the middleware identifies but never authorizes.
- **`request.caller` is set alongside `request.authContext`.** A stub carrying only the session would let a guard pass while attributing every denial in the audit trail to nobody; tests assert both fields.
- **Idempotency across routers.** Two modules sharing a URL prefix both mount `getAuth`; an unmatched route in the first falls through to the second. The test asserts the JWT resolver is hit exactly once, not twice.
- **`nowSeconds()`** returns epoch _seconds_ (matching the JWT `auth_time` claim), not milliseconds — relevant for `requireFreshAuth` staleness windows.
