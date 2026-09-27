---
source: src/kernel/middlewares/authorizations.ts
sha256: 84021e32d3c38f833a370195ce6a04700aae01083a80d4b306e011f1ef9bd6ac
generated_at: 2026-09-27T14:19:02.469610+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that enforce authentication and authorization at the route level. Built on the token/credential resolvers in `kernel/authentication.ts`, these guards populate or inspect `request.authContext` / `request.caller`, verify permission keys against the caller's roles, gate requests by recency of proof, and audit every refusal before the response is sent. They are the single choke-point between an HTTP request and the route handlers in every module.

## Key elements

- **`getTokenBearer(request)`** — Extracts the bearer token from the `Authorization` header (second space-delimited segment), or returns `undefined`.
- **`getAuth(request, response, next)`** — Primary upstream middleware. Resolves a JWT bearer token into `request.authContext` + `request.caller`, or an `sk_…` API-key into `request.caller` + `request.credentialId`. Idempotent: skips work if either is already set. On infrastructure failure calls `next(error)` (→ 503); on invalid/expired token proceeds anonymous. Applies `apiKeyLimiter` for credential callers.
- **`isAuth(request, response, next)`** — 401 guard. Passes only when the request carries a **bearer-authenticated human session** (`authContext` + a bearer token present). Deliberately rejects API-key credentials.
- **`isAuthOrCredential(request, response, next)`** — 401 guard. Passes when the request carries either a bearer session **or** a resolved `sk_…` credential. For routes whose subject is tenant data rather than the caller themselves.
- **`requirePermission(key)`** — (truncated in source) 403 guard. Checks `holdsKey` for the given permission key against the caller's scope. Calls `assertDeclared` at mount time so an unowned key is a **boot-time failure**, not a silent 403 at runtime.
- **`requirePermissionViaCookie(key)`** — SSE-only variant. Authenticates via the refresh cookie (`readRefreshCookie`) instead of an `Authorization` header, since browsers cannot set headers on `EventSource`.
- **`requireFreshAuth` / `requireFreshAuthWhen`** — (truncated) Gate an already-authenticated caller on how recently they re-proved identity, using a `StepUpTier` → seconds mapping.
- **`auditRefusal(request, fields)`** — Internal helper. Records an audit event (route, method, outcome `failure`) before any 401/403 response is written.
- **`continueOrFailInfra(next, error)`** — Internal helper. Distinguishes infrastructure errors (→ `next(error)`, global 503 handler) from auth failures (→ `next()`, proceed anonymous).
- **`errorLocaleKeyFor(code)`** — Maps a machine code (e.g. `EMAIL_NOT_VERIFIED`) to its locale key (`generic.error-email-not-verified`). Single rule used by both the default 403 and any per-key `deniedCode` override.
- **`hasBearerSession(request)` / `isCredentialCaller(request)`** — Internal discriminators that distinguish the three caller shapes (bearer session, cookie session, API-key credential) by the specific field combinations `getAuth` writes.

## Relationships

- **`@kernel/authentication`** — Source of `resolveAccessToken`, `resolveRefreshToken`, `resolveCredential`, and the `API_KEY_TOKEN_PREFIX` constant that `getAuth` checks before attempting JWT parsing.
- **`@kernel/permissions`** — Provides `assertDeclared`, `callerFor`, `callerInScope`, `findKey`, `scopeOfKey`, and the `StepUpTier` type. Guards call these to resolve scope, verify key ownership, and compute recency windows.
- **`@kernel/ability`** — `holdsKey` is the role→permission check used by `requirePermission`.
- **`@kernel/cookies`** — `readRefreshCookie` is used by `requirePermissionViaCookie` for SSE authentication.
- **`@infrastructure/http/errors`** — `isInfrastructureError` lets `continueOrFailInfra` separate infra outages (503) from bad credentials (anonymous/401).
- **`@infrastructure/http/response`** — `rejectResponse` and `ResponseErrorItem` are the uniform 401/403 body shape.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the actor identity fields for audit records.
- **`@infrastructure/i18n`** — `t()` localizes user-facing error messages (401/403 bodies).
- **`@infrastructure/http/middlewares/rate-limit`** — `apiKeyLimiter` enforces per-key request budgets inline within `getAuth`.
- **`@infrastructure/observability/audit`** — `recordAudit`, `coreAuditActions`, `buildAuditEvent` back every refusal record.
- **`@infrastructure/runtime/environment`** — `environmentNumber` supplies tier/recency thresholds from environment config.
- **`src/modules/account/routes.ts` / `src/modules/addresses/routes.ts`** — Representative consumers; each mounts `getAuth` + `isAuth`/`requirePermission` on its own router (two modules may share a URL prefix, which is why `getAuth` is idempotent).
- **`src/modules/account/tests/contract/api.contract.test.ts`** — Exercises the 401/403 paths these guards produce.

## Notes

- **Permission keys, not roles.** Guards accept a key string (e.g. `'account:read'`), never a role name. `assertDeclared` at mount time turns a typo into a boot failure, not a route that silently 403s forever.
- **`isAuth` ≠ "any authenticated caller."** It rejects API-key credentials by design. Use `isAuthOrCredential` when a route is legitimately reachable by machines.
- **Audit-before-reject.** Every 401/403 path calls `auditRefusal` *before* writing the response. A refusal with no audit record is treated as a bug.
- **Infra vs. auth failures must not be conflated.** An unreachable Mongo/Redis surfaces as 503 (via `next(error)`), never as "invalid token." This is RFC 9110 §15.5.2-compliant and prevents masking outages as credential problems.
- **`sk_` prefix check precedes JWT parsing.** API-key tokens are opaque and never start with `eyJ`, so the `startsWith` guard skips a wasted base64url decode.
- **Idempotency under shared URL prefixes.** Two routers (e.g. `account` and `addresses`) may both mount `getAuth` on the same path. The guard short-circuits if `authContext` or `caller` is already populated, preventing duplicate DB reads and double-charging an API key's rate-limit budget.
