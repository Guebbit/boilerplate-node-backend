---
source: src/kernel/middlewares/authorizations.ts
sha256: 37081fd85fe34d4ea4573cb06177c751fa8060bc8ad312167b1f80c5bdc80151
generated_at: 2026-10-14T08:22:47.694411+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that resolve session credentials (Bearer token or session cookie) onto the request, enforce permission-key checks, and audit every refusal before the response is sent. Exists to give routes a uniform set of "is this caller allowed?" checks while guaranteeing a trail for every denied request.

## Key elements

- **`getAuth`** — Resolves `request.authContext` (session) or `request.caller`/`credentialId` (API key) from a Bearer header or session cookie; leaves the request anonymous when no valid credential is present. Idempotent: skips if a caller was already resolved by an upstream router.
- **`isAuth`** — Rejects (401) when `authContext`/`caller` is absent.
- **`requirePermission`** — Rejects (403) when the caller's role does not hold the given permission key. Accepts a permission key, never a role name; `assertDeclared` enforces the key is owned by a module at boot.
- **`requirePermissionViaCookie`** — SSE-specific variant that authenticates via the session cookie instead of the `Authorization` header.
- **`requireFreshAuth` / `requireFreshAuthWhen`** — Gate an already-authenticated caller on how recently they proved their identity (step-up / re-auth window).
- **`getTokenBearer`** — Extracts the token from `Authorization: Bearer <token>` using a case-insensitive regex.
- **`continueWithCookie`** — Cookie-auth path of `getAuth`; enforces `requireAllowedOrigin` (CSRF) on unsafe methods before resolving the cookie.
- **`continueWithSession`** — Shared promise handler for both Bearer and cookie paths; applies the session or records the miss.
- **`applySession`** — Copies the resolved user onto `request.authContext` and resolves `request.caller` via `callerInScope(…, 'tenant')`.
- **`continueOrFailInfra`** — Distinguishes infrastructure failures (forward to `next(error)` → 503) from auth misses (proceed anonymous).
- **`noteMiss`** — Increments `staleCredentialsTotal` metric; records a `SecurityEvent` when the miss names an attack (bad signature, malformed, revoked API key).
- **`auditRefusal`** — Records an audit entry with `outcome: 'failure'`, route, and method before the rejection response is sent.
- **`errorLocaleKeyFor`** — Maps an `ErrorCode` string to its `generic.error-*` locale key (single convention across the codebase).
- **`SAFE_METHODS`** — `GET`, `HEAD`, `OPTIONS`; exempt from the cookie-origin (CSRF) check.

## Relationships

- **`@kernel/authentication`** — Source of `resolveBearer`, `resolveCookie`, `resolveCredential`, `cookieAuthenticatesRequests`, `API_KEY_TOKEN_PREFIX`, and the `ResolveMissReason` union; the resolver whose promises these guards consume.
- **`@kernel/permissions`** — Provides `assertDeclared` (boot-time key ownership), `callerFor`/`callerInScope` (role→key resolution), `findKey`, `scopeOfKey`, and `StepUpTier` (used by `requireFreshAuth*`).
- **`@kernel/ability`** — `heldKeys` and `holdsKey` determine whether a caller's role contains a given permission key.
- **`@kernel/cookies`** — `readSessionCookie` extracts the session cookie value.
- **`@kernel/config`** — `reauthWindowSeconds` sets the re-auth freshness threshold.
- **`@infrastructure/http/middlewares/origin`** — `requireAllowedOrigin` is invoked on unsafe cookie-authenticated requests (CSRF guard).
- **`@infrastructure/http/middlewares/rate-limit`** — `apiKeyLimiter` enforces per-key request budgets before the API-key resolution proceeds.
- **`@infrastructure/http/request`** — `callerContextOf` builds the caller context passed to audit and security-event records.
- **`@infrastructure/http/response`** — `rejectResponse` and `ResponseErrorItem` shape the JSON error body for 401/403/429 replies.
- **`@infrastructure/http/errors`** — `isInfrastructureError` distinguishes 503-worthwhile failures from ordinary auth misses.
- **`@infrastructure/observability/audit`** — `recordAudit`, `coreAuditActions`, `buildAuditEvent` write the refusal trail.
- **`@infrastructure/observability/security-events`** — `recordSecurityEvent`, `staleCredentialsTotal`, `SecurityEventAction` track credential-related attacks and metrics.
- **`@infrastructure/i18n`** — `t` localizes rejection messages.

## Notes

- **Permission keys, not roles.** Guards accept a key string; a typo in a mount fails at boot via `assertDeclared` rather than silently allowing/denying traffic.
- **Infrastructure vs. auth failure.** A resolver rejection that is an `InfrastructureError` is forwarded to `next(error)` (→ 503). A plain miss (expired token, unknown user) continues the request anonymously so `isAuth`/`requirePermission` can produce the correct 401/403. Conflating the two would either leak a 500 as "invalid token" or mask an outage.
- **Idempotent guard.** Because two modules can share a URL prefix and each mount `getAuth` on its own router, the guard short-circuits when `request.authContext` or `request.caller` is already set, preventing duplicate resolution and double-spending an API-key rate-limit budget.
- **CSRF is enforced here, not per-route.** `continueWithCookie` wraps cookie resolution in `requireAllowedOrigin` for any unsafe method, so no route can be added that a cookie reaches without the origin check.
- **API-key prefix check precedes session parsing.** `sk_…` tokens are opaque and cannot collide with the `eyJ…` JWT prefix, so the guard routes them to credential resolution before attempting a JWT parse.
- **Locale-key convention is rigid.** `errorLocaleKeyFor` is the *only* mapping from `ErrorCode` → locale key; a new `deniedCode` override in a `PermissionKey` requires a matching `generic.error-<kebab-case>` entry in `locales/*.json` and nothing else.
