---
source: src/kernel/middlewares/authorizations.ts
sha256: 3a68d4ed62f81939f660cb92ecb9cc3c8c0f5b06f52203fe1c1771c55a5c61f0
generated_at: 2026-11-08T03:53:49.958067+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that sit between authentication (credential resolution) and route handlers. They populate `request.authContext`, enforce permission rules declared per-route, gate requests by session recency, and—critically—audit every refusal before the response is sent. The file exists so that identity and authorization concerns are handled in one place, keeping route handlers free of token-parsing, role-checking, and audit plumbing.

## Key elements

- **`getTokenBearer`** (exported) – Extracts the bearer token from the `Authorization` header; returns `undefined` if absent or not a `Bearer` scheme.
- **`errorLocaleKeyFor`** – Maps a `FORBIDDEN`-style error code to its `generic.error-*` i18n key (single rule for both default and per-rule `deniedCode` overrides).
- **`auditRefusal`** – Records an audit event (`outcome: 'failure'`) with route + method, so every denied request is locatable.
- **`securityActionFor`** – Classifies a credential miss (`invalid_signature`, `malformed`, `revoked` on an API key) into a named security-event action; returns `undefined` for benign stale credentials.
- **`noteMiss`** – Increments `staleCredentialsTotal` or fires `recordSecurityEvent` depending on the miss reason.
- **`applySession`** – Copies the resolved user into `request.authContext`, sets `request.sessionVia` (`'bearer' | 'cookie'`), and resolves `request.caller` via `callerInScope`.
- **`resolveOptionsOf`** – Reads the `Session-Passive: true` header to mark a request as a keep-alive/poll.
- **`continueWithSession`** – Awaits a `Resolution`, calls `noteMiss` on failure, applies the session on success, and delegates "nobody" / dead-user refusal to a callback.
- **`takesNoSignIn`** – Checks the generated `OPERATION_ROUTES` table to see whether the request's method+path maps to a `security: []` operation (login, refresh, etc.).
- **`refuseDeadBearer`** – Sends the RFC 6750 401 (`WWW-Authenticate: Bearer error="invalid_token"`) for a dead bearer; skips if the operation takes no sign-in; uses `SESSION_IDLE` code for idle staff sessions.
- **`continueWithCookie`** – The cookie-mode path: reads the session cookie, enforces `requireAllowedOrigin` on unsafe methods (CSRF layer on top of `SameSite=Lax`), resolves via `resolveCookie`, and clears the cookie on a dead session.

The module docstring also describes **`getAuth`**, **`isAuth`**, **`requirePermission`**, **`requirePermissionViaCookie`**, **`requireFreshAuth`**, and **`requireFreshAuthWhen`** (the latter two gate on recency of proof-of-auth); these are further down in the file (truncated here).

## Relationships

- **`@kernel/authentication`** – Source of all credential resolution primitives (`resolveBearer`, `resolveCookie`, `watchCookie`, `resolveCredential`, `cookieAuthenticatesRequests`, `clearDeadSessionCookie`) and the `Resolution` / `ResolveMissReason` types.
- **`@kernel/permissions`** – Provides `assertDeclared` (boot-time rule validation), `callerInScope` / `callerForSubject` (subject resolution), `ruleId`, `staffRoleWithheld`, and the `ActionOn` / `PermissionSubject` / `StepUpTier` types used by `requirePermission`.
- **`@kernel/ability`** – `holds` is the actual permission-check predicate against a caller's resolved abilities.
- **`@kernel/cookies`** – `bearerOf` and `readSessionCookie` extract raw credential values from the request.
- **`@kernel/config`** – `reauthWindowSeconds` sets the recency window for `requireFreshAuth` / `requireFreshAuthWhen`.
- **`@infrastructure/http/response`** – `rejectResponse` and `ResponseErrorItem` shape every 401/403 error body.
- **`@infrastructure/http/request`** – `callerContextOf` extracts the audit identity (actor, tenant) from the request for audit records.
- **`@infrastructure/http/middlewares/origin`** – `requireAllowedOrigin` is invoked inside `continueWithCookie` to enforce the Origin check on unsafe methods before a cookie can authenticate.
- **`@infrastructure/http/middlewares/rate-limit`** – `apiKeyLimiter` is applied to API-key-authenticated requests to throttle credential brute-force.
- **`@infrastructure/observability/audit`** – `recordAudit`, `buildAuditEvent`, `coreAuditActions` produce the audit trail for every refusal and security event.
- **`@infrastructure/observability/security-events`** – `recordSecurityEvent` and `staleCredentialsTotal` (Prometheus counter) track attack indicators and stale-credential volume.
- **`@infrastructure/i18n`** – `t` localizes user-facing error messages (e.g. `account.session-idle`).
- **Module route files** (`account/routes.ts`, `addresses/routes.ts`, …) – Consumers of the exported guards (`getAuth`, `isAuth`, `requirePermission`, etc.) mounted on their Express routers.

## Notes

- **Guard signature convention:** a guard always takes an *action* and a *subject* (e.g. `requirePermission(request, 'addresses', 'read')`), never a raw role string. `assertDeclared` at boot rejects any rule that no module owns, turning a typo into a startup failure.
- **Audit-before-respond:** every refusal path calls `auditRefusal` (or `noteMiss` → `recordSecurityEvent`) *before* writing the HTTP response. A denied request without an audit record is treated as a bug.
- **Cookie CSRF placement:** the Origin check lives inside `continueWithCookie` rather than in each route, so no future route can accidentally expose a cookie-authenticated endpoint without the check.
- **`Session-Passive` header:** can only ever *increase* the idle window (a client marking itself passive); it cannot be forged to reduce it, so the resolver applies it as a one-directional hint.
- **Dead-bearer 401 vs. no-auth 401:** a presented-but-dead bearer gets an explicit 401 with `WWW-Authenticate` (RFC 6750 §3.1) so the client can refresh; a request with no credential at all on an open operation simply passes through as a guest.
- **Locale key rule:** `errorLocaleKeyFor` is the *only* mapping from error code → i18n key. A new `deniedCode` override on a `PermissionKey` needs only the matching `generic.error-<kebab>` key in locale files—no code change.
