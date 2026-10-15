---
source: src/kernel/middlewares/authorizations.ts
sha256: 9a6c889b98ae1a14069230b1c4fab5d5cb113c7252126aa17876b7d25c1eb02e
generated_at: 2026-10-15T09:51:49.920073+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that resolve a caller's identity (bearer token or session cookie) and enforce permission-key-level access. Every guard rejection is audited and, where applicable, surfaced as a security event before the response is sent. The file exists so that routes declare *which permission key* they need rather than *which role*, and so a single middleware chain handles anonymous access, authenticated access, rate-limited API keys, and freshness re-authentication uniformly.

## Key elements

- **`getTokenBearer`** – Extracts the Bearer token from the `Authorization` header; returns `undefined` when absent.
- **`getAuth`** – Primary middleware: resolves the caller via bearer token, session cookie (in cookie mode), or API key; populates `request.authContext`, `request.caller`, `request.sessionVia`; answers 429 for over-budget API keys and 403 for cookie-authenticated cross-origin unsafe requests.
- **`isAuth`** *(referenced in module doc)* – Rejects (401) when `authContext` is absent.
- **`requirePermission`** *(referenced in module doc)* – Rejects when the caller's role does not hold the supplied permission key; uses `errorLocaleKeyFor` for the i18n error code.
- **`requirePermissionViaCookie`** *(referenced in module doc)* – SSE-specific variant that authenticates by session cookie rather than `Authorization` header.
- **`requireFreshAuth` / `requireFreshAuthWhen`** *(referenced in module doc)* – Gate an already-authenticated caller on how recently they proved identity (`reauthWindowSeconds` from config).
- **`auditRefusal`** – Records an audit event (route, method, outcome `failure`) before a guard answers a denial.
- **`noteMiss` / `securityActionFor`** – Classify a refused credential (invalid signature, malformed, revoked API key, stale session) and either increment a stale-credentials counter or record a security event.
- **`continueWithSession`** – Shared promise handler for bearer and cookie resolution; distinguishes miss, success, and infrastructure failure.
- **`continueWithCookie`** – Cookie path; adds a `requireAllowedOrigin` CSRF check for unsafe methods before resolving.
- **`applySession`** – Copies the resolved user onto `request.authContext`, sets `request.sessionVia`, and resolves `request.caller` via `callerInScope`.
- **`errorLocaleKeyFor`** – Maps a string error code (e.g. `FORBIDDEN`) to its i18n key (`generic.error-forbidden`).

## Relationships

- **`@kernel/authentication`** – Source of all credential resolution (`resolveBearer`, `resolveCookie`, `resolveCredential`, `watchCookie`, `clearDeadSessionCookie`, `cookieAuthenticatesRequests`). This file is the Express-facing consumer of that kernel.
- **`@kernel/permissions`** – Provides `assertDeclared`, `callerFor`, `callerInScope`, `findKey`, `scopeOfKey`, `StepUpTier`; the permission-key registry that guards consult at runtime.
- **`@kernel/ability`** – `heldKeys` / `holdsKey` used to test whether a caller's role set contains a required key.
- **`@kernel/cookies`** – `bearerOf` and `readSessionCookie` extract raw tokens from headers and cookies.
- **`@kernel/config`** – `reauthWindowSeconds` sets the freshness window for `requireFreshAuth`.
- **`@infrastructure/http/response`** – `rejectResponse` sends structured error bodies (401, 403, 429) on guard failure.
- **`@infrastructure/http/request`** – `callerContextOf` extracts identity fields for audit/security event records.
- **`@infrastructure/http/errors`** – `isInfrastructureError` distinguishes infrastructure outages (→ 503) from auth failures (→ anonymous continue).
- **`@infrastructure/http/middlewares/origin`** – `requireAllowedOrigin` enforces the CSRF origin check for cookie-authenticated unsafe methods.
- **`@infrastructure/http/middlewares/rate-limit`** – `apiKeyLimiter` enforces per-key request budgets inside `getAuth`.
- **`@infrastructure/observability/audit`** – `recordAudit`, `buildAuditEvent`, `coreAuditActions` back every refusal trail.
- **`@infrastructure/observability/security-events`** – `recordSecurityEvent`, `staleCredentialsTotal` track forgery/revocation signals and stale-credential counts.
- **`@infrastructure/i18n`** – `t` localises user-facing error messages.

## Notes

- Guards accept a **permission key** string, never a role name. `assertDeclared` (from `@kernel/permissions`) validates at mount time that the key exists in the registry, turning a typo into a boot-time failure rather than a permanently-denied route.
- Infrastructure failures (Mongo/Redis unreachable) are **never** conflated with credential rejection: `continueOrFailInfra` routes them to the global 503 handler, while a refused token simply leaves the request anonymous and lets `isAuth`/`requirePermission` produce the 401/403.
- The `X-Session-Passive: true` request header can only *increase* the perceived idleness of a session; there is no forge-able path to make a session look more active.
- A refused session cookie is immediately cleared via `clearDeadSessionCookie` so subsequent requests skip the lookup.
- The error-code → locale-key mapping is a single convention (`UPPER_SNAKE` → `generic.error-lower-kebab`); adding a new `deniedCode` override on a `PermissionKey` requires only the matching `locales/*.json` entry.
