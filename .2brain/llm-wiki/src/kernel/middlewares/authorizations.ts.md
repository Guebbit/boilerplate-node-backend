---
source: src/kernel/middlewares/authorizations.ts
sha256: 0bc6cbc8fd85d379b4d0b53b7a1ee40d0e8eefd1b3684ed09c7559ac3e1dc75d
generated_at: 2026-11-14T18:21:59.924658+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards for identity and permission checks. Built on `kernel/authentication.ts`'s credential resolver, these guards authenticate a caller (via bearer header or session cookie), verify that the caller's role holds a declared permission rule, and optionally gate on how recently the caller proved their identity. Every rejection is audited before the response is sent, so a denied request always leaves a trail.

## Key elements

- **`getTokenBearer`** – Extracts the bearer token from the `Authorization` header, or returns `undefined`.
- **`getAuth`** *(described in module doc; full impl below truncation)* – Populates `request.authContext` when a credential is present; does not reject.
- **`isAuth`** – Rejects (401) when no valid session is resolved.
- **`requirePermission`** – Rejects (403) when the caller's role does not hold the declared rule. Takes an action-and-subject pair, never a raw role name.
- **`requirePermissionViaCookie`** – SSE-only variant that authenticates via session cookie instead of `Authorization` header.
- **`requireFreshAuth` / `requireFreshAuthWhen`** – Gate an already-authenticated caller on how recently they re-proved identity (window from `reauthWindowSeconds` in config).
- **`applySession`** (internal) – Writes the resolved user onto `request.authContext`, sets `request.sessionVia`, and resolves `request.caller` once via `callerInScope`.
- **`continueWithSession`** (internal) – Shared async flow for bearer and cookie paths; calls `noteMiss` on refusal, applies the session on success, and delegates "dead" refusals.
- **`continueWithCookie`** (internal) – Cookie path of `getAuth`; adds the CSRF `Origin` check for unsafe methods before resolving.
- **`refuseDeadBearer`** (internal) – Sends a 401 with `WWW-Authenticate: Bearer` for expired/revoked/malformed tokens; exempts open operations.
- **`auditRefusal`** (internal) – Records an audit event (route + method in metadata) before a rejection response is sent.
- **`noteMiss`** (internal) – Increments `staleCredentialsTotal` or records a security event (forged signature, revoked API key, etc.) depending on the miss reason.
- **`errorLocaleKeyFor`** (internal) – Maps an error code to its locale key using the single `generic.error-<kebab-case>` convention.
- **`takesNoSignIn`** (internal) – Checks the generated `OPERATION_ROUTES` table to see if the matched operation declares `security: []`.

## Relationships

- **`src/kernel/authentication.ts`** – Primary dependency: `resolveBearer`, `resolveCookie`, `resolveCredential`, `clearDeadSessionCookie`, `cookieAuthenticatesRequests`, `API_KEY_TOKEN_PREFIX`, and the `Resolution`/`ResolveMissReason` types drive all credential resolution here.
- **`src/kernel/permissions.ts`** – `assertDeclared` (boot-time rule validation), `callerInScope`, `callerForSubject`, `ruleId`, `staffRoleWithheld`, and the `ActionOn`/`PermissionSubject`/`StepUpTier` types power `requirePermission`.
- **`src/kernel/ability.ts`** – `holds` is called to test whether a resolved caller satisfies a rule.
- **`src/kernel/cookies.ts`** – `bearerOf` and `readSessionCookie` extract raw credentials from headers/cookies.
- **`src/kernel/config.ts`** – `reauthWindowSeconds` sets the freshness window for `requireFreshAuth`.
- **`src/infrastructure/http/middlewares/origin.ts`** – `requireAllowedOrigin` enforces CSRF on unsafe methods authenticated by cookie.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – `apiKeyLimiter` throttles API-key-authenticated requests.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` extracts the caller identity for audit/security records.
- **`src/infrastructure/http/response.ts`** – `rejectResponse` and `ResponseErrorItem` shape all 401/403 error bodies.
- **`src/infrastructure/i18n/index.ts`** – `t` localizes user-facing error messages.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit`, `coreAuditActions`, `buildAuditEvent` write the refusal trail.
- **`src/infrastructure/observability/security-events.ts`** – `recordSecurityEvent` and `staleCredentialsTotal` track credential-refusal metrics and named attack events.
- **`src/modules/account/routes.ts`**, **`src/modules/addresses/routes.ts`** – Consumers that mount these guards on their route handlers.

## Notes

- **Action-and-subject, not role name.** Guards always take a declared rule (`ActionOn` + `PermissionSubject`). `assertDeclared` validates at boot that a module actually owns the rule, so a typo in a route mount is a crash, not a silently-unreachable route.
- **CSRF is centralized.** The `Origin` check for cookie-authenticated unsafe methods lives inside `continueWithCookie`, the single point where cookie credentials are resolved—no route can be added that a cookie reaches without passing it.
- **`Session-Passive: true`** header can only make a session *more* idle; it cannot escalate. Used by pollers/keep-alives to avoid counting as user activity.
- **Dead cookie clearing.** If the resolver refuses a cookie token (revoked, expired, foreign mode), `clearDeadSessionCookie` is called immediately so subsequent requests skip the lookup.
- **Audit-before-respond.** `auditRefusal` runs before `rejectResponse` is sent, guaranteeing the trail exists even if the response pipeline short-circuits.
- **Locale key convention is singular.** `FORBIDDEN` → `generic.error-forbidden`. A new `deniedCode` override on a `PermissionKey` needs only the matching JSON key; no code change.
- **Open-operation exemption.** `takesNoSignIn` reads the generated `OPERATION_ROUTES` table (fewest-parameters-first), so a new `security: []` operation is exempt automatically without touching this file.
- **File is large; the visible portion covers session/bearer/cookie resolution and refusal paths.** The permission-check and freshness-gate exports (`requirePermission`, `requireFreshAuth`, etc.) are declared in the module doc and follow the same audit-before-respond pattern.
