---
source: src/kernel/middlewares/authorizations.ts
source_sha256: ee6ea25ca402d2980e8d6078975182620a84e54737c437dd174cb79356db28fa
context_sha256: 05166000ebc0fbf4c55b940e7aab7722505ebb2149de5c88d8d52d842627dc1d
generated_at: 2026-11-22T03:13:04.873369+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/middlewares/authorizations.ts

## Purpose
Express guards built on the credential resolver in `@kernel/authentication`. They populate `request.authContext`, reject unauthenticated or unauthorized callers, and require recent proof of identity ("fresh auth") for sensitive routes. Every rejection from the identity guards is audited before the response is sent, so a denied request always leaves a trail. Guards take an action and a subject, never a role name. Roles are editable data, while rules are code declared beside the routes, and `assertDeclared` turns a typo in a mount into a boot failure.

## Key elements
- `getAuth`: populates `request.authContext` when a token is present. In `cookie` session mode it also accepts the session cookie.
- `isAuth`: rejects when no credential is present.
- `requirePermission`: rejects when the caller's role does not hold a given rule (action + subject).
- `requirePermissionViaCookie`: SSE-only variant that authenticates by session cookie instead of an `Authorization` header.
- `requireFreshAuth` / `requireFreshAuthWhen`: gate an already-authenticated caller on how recently they proved their identity.
- `getTokenBearer(request)`: exported helper that extracts the bearer token from the `Authorization` header via `bearerOf`.
- `errorLocaleKeyFor(code)`: maps an error code to a locale key (`FORBIDDEN` becomes `generic.error-forbidden`). Used for both the default and a rule's `deniedCode` override.
- `refusalFields` / `auditRefusal` / `logRefusal`: build refusal audit fields (adding route and method, `outcome: 'failure'`). `auditRefusal` stores a row and a log line. `logRefusal` writes the log line only, for routine refusals.
- `securityActionFor` / `noteMiss`: classify a refused credential. A bad signature, a malformed value or a revoked `sk_` API key is an attack and is stored as a security event. Expired, revoked or idle session JWTs are "stale" and only increment `staleCredentialsTotal` and produce a log line.
- `applySession`: copies the resolved user fields onto `request.authContext`, sets `request.sessionVia` (`bearer` or `cookie`), and sets `request.caller` via `callerInScope(..., 'tenant')`.
- `resolveOptionsOf`: reads the `Session-Passive: true` header so polls and keep-alives are not counted as user activity.
- `continueWithSession`: resolves a session promise, notes misses, flags idle sessions (`request.sessionIdle`), applies the session, and calls `next`.
- `takesNoSignIn`: checks the generated `OPERATION_ROUTES` table to see whether the contract marks an operation as open (`security: []`). HEAD is treated as GET.
- `refuseDeadBearer`: answers 401 with `WWW-Authenticate: Bearer error="invalid_token"` for a bearer that names no live session. It answers `SESSION_IDLE` for idle sessions and is skipped for open operations.

## Relationships
- `@kernel/authentication`: supplies the resolvers (`resolveBearer`, `resolveCookie`, `resolveCredential`), cookie helpers, `API_KEY_TOKEN_PREFIX` and the `Resolution` / `ResolveMissReason` types.
- `@kernel/permissions` and `@kernel/ability`: rule declaration and checking (`assertDeclared`, `callerInScope`, `callerForSubject`, `ruleId`, `staffRoleWithheld`, `holds`, step-up tiers).
- `@kernel/cookies`: `bearerOf` and `readSessionCookie` read the credentials.
- `@kernel/config`: `reauthWindowSeconds` sets the freshness window.
- `@infrastructure/http/response`: `rejectResponse` sends the error responses.
- `@infrastructure/http/request`: `callerContextOf` builds the context for audit records.
- `@infrastructure/http/middlewares/rate-limit` (`apiKeyLimiter`) and `origin` (`requireAllowedOrigin`): imported for use by the guards.
- `@infrastructure/observability/audit` and `security-events`: `recordAudit`, `recordAuditLine`, `recordSecurityEvent` and `staleCredentialsTotal` provide the audit trail and metrics.
- `@infrastructure/i18n`: `t` localizes error messages.
- `@api/operation-routes` and `@api/error-codes`: the route table and the error codes.
- Route modules such as `src/modules/account/routes.ts` and `src/modules/addresses/routes.ts` mount these guards.

## Notes
- The `Session-Passive` header can only make a session look more idle, so it cannot be abused.
- One refused credential produces one log line. `noteMiss` sets `request.refusalLogged` so the 401 that follows does not log it again.
- Stale credentials are deliberately not stored as audit rows, because anyone can send them at any rate and a stale tab sends them regularly.
- A request that matches no contract operation is not treated as an open operation.
