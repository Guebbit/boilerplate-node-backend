---
source: tests/unit/kernel/authorizations.test.ts
sha256: f44fa09af7a05ada17c3d07d305a191a6d5c7372fc07bb802871baef16405455
generated_at: 2026-11-08T10:26:39.048950+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the authorization middlewares in `src/kernel/middlewares/authorizations.ts`. Verifies the three tiers of identification/elevation (`getAuth`, `isAuth`, `requirePermission`) and their cookie/fresh-auth variants, focusing on the distinct failure statuses (401 vs 403), the `{ miss }` vs `{ ok: undefined }` resolver contract, and the audit-trail side effects. The response layer is kept real so asserted status codes reflect what a client actually receives.

## Key elements

- **`getTokenBearer` tests** — validates Bearer-prefix stripping, case-insensitive scheme, and rejection of unknown/missing schemes.
- **`getAuth` tests** — optional identification: no token → `next()` with no `authContext`; valid token → attaches `authContext` + `caller`; bad bearer → 401 with `WWW-Authenticate`; `sk_…` credential branch; resolver rejection → `next(error)`.
- **`isAuth` tests** — required identification; fails closed with 401 when no valid credential.
- **`requirePermission` / `requirePermissionViaCookie` tests** — required elevation; 401 (no credentials) vs 403 (credentials present but insufficient); audit trail records the specific refusal reason while the response body stays generic.
- **`requireFreshAuth` / `requireFreshAuthWhen` tests** — session-freshness window enforcement using `authTime` (epoch seconds).
- **`stillHoldsRuleViaCookie`, `stillSignedInViaCookie`, `requireSessionViaCookie` tests** — cookie-session recheck via the `recheckFamily` fake.
- **`makeRequest`, `makeCookieRequest`, `makeCredentialRequest`** — typed request stubs for the three credential channels (bearer, cookie, API-key).
- **`runUntilNext`, `runUntilRefused`** — helpers that drive an async middleware to completion (either `next()` call or `response.json` refusal).
- **Audit mock block** — overrides only `emitAuditEvent` and `recordAudit`; `buildAuditEvent` and `coreAuditActions` vocabulary remain real so shape mismatches surface here.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the module under test; all exports are exercised directly.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` / `registerCredentialResolver` are called at module scope to install the fake resolvers that the middlewares invoke.
- **`src/kernel/permissions.ts`** — `callerInScope` is used in assertions to confirm the resolved `caller` matches the expected scope.
- **`src/infrastructure/observability/audit.ts`** — partially mocked: `emitAuditEvent` replaced with a jest.fn; `recordAudit` overridden to route through the mock; `buildAuditEvent` and `coreAuditActions` kept real.
- **`src/infrastructure/observability/security-events.ts`** — `securityEventsTotal` and `staleCredentialsTotal` counters asserted on refusal/staleness paths.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — `AuthContext` and `Caller` types shape the resolver fakes and assertions.
- **`tests/support/callers.ts`** — `asCustomer` / `asAdmin` produce realistic `AuthContext` fixtures.
- **`tests/support/express.ts`** — `makeResponseStub` provides a chainable `status().json()` response with captured headers.
- **`tests/support/stub.ts`** — `asStub` builds the typed request/response objects used throughout.

## Notes

- **`recordAudit` mock override is load-bearing.** `recordAudit` (in the audit module) closes over its own module-scope `emitAuditEvent`, so a plain `emitAuditEvent` mock is invisible to it. The test explicitly redefines `recordAudit` to call the mocked `emitAuditEvent` via `buildAuditEvent`. Omitting this override silently loses audit assertions.
- **`{ miss }` vs `{ ok: undefined }` must stay distinguishable in every fake.** The former maps to 401, the latter to 403. Collapsing them in a resolver stub will mask permission-logic bugs.
- **`getAuth` must call `next()` exactly once on every path.** Tests assert this via `runUntilNext`; a missing `next()` call causes the promise to hang (test timeout) rather than fail cleanly.
- **`authTime` is epoch seconds**, matching the JWT `auth_time` claim. The `staleRequest` helper subtracts 999 s to land outside any freshness tier.
- **`caller` is asserted alongside `authContext`.** `getAuth` sets both; a guard that passes `authContext` but skips `caller` would pass the session assertion while attributing every audit denial to `undefined`.
- The file is truncated in the provided content; the full test suite likely covers `isAuth`, `requirePermission`, cookie variants, and fresh-auth paths beyond what is visible here.
