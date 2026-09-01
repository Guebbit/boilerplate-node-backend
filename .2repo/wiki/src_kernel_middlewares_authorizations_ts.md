# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that sit in front of route handlers to enforce authentication and role-based access. They build on the token resolvers in `kernel/authentication.ts`, attach a caller identity to `request.authContext`, and emit an audit event before every rejection so that no denied request goes unrecorded.

## Key elements

- **`getTokenBearer(request)`** – Utility that extracts the bearer token from the `Authorization` header (`split(' ')[1]`); returns `undefined` if the header is missing.
- **`getAuth(request, response, next)`** – "Soft" resolver middleware. Calls `resolveAccessToken`; on success populates `request.authContext` (id, email, username, admin, imageUrl). Never rejects — an absent or invalid token simply leaves `authContext` unset and calls `next()`.
- **`isAuth(request, response, next)`** – Hard gate. If `authContext` is missing *or* the header carries no token, emits a `SECURITY_UNAUTHORIZED` audit event and returns 401. Otherwise calls `next()`.
- **`isAdmin(request, response, next)`** – Admin gate. Distinguishes 401 (no caller at all — defensive check, normally unreachable because `isAuth` runs first) from 403 (authenticated but non-admin). Audits each case with a distinct `reason` in metadata.
- **`isAdminViaCookie(request, response, next)`** – SSE-only variant. Reads the `jwt` cookie, resolves it via `resolveRefreshToken`, and populates `authContext` only if the user is an admin. Returns 401 for missing/expired cookie, 403 for a valid non-admin token. Uses i18n (`t`) for client-facing messages.

## Relationships

- **`src/kernel/authentication.ts`** – Provides `resolveAccessToken` and `resolveRefreshToken`, the two token-validation functions this file delegates to.
- **`src/infrastructure/observability/audit.ts`** – Supplies `emitAuditEvent`, `buildAuditEvent`, and `coreAuditActions`; every rejection path in this file calls these before responding.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf(request)` used to populate the audit event's caller metadata.
- **`src/infrastructure/http/response.ts`** – Provides `rejectResponse` for uniform 401/403 responses.
- **`src/infrastructure/i18n/index.ts`** (via `@infrastructure/i18n`) – Provides the `t` function; used by `isAdminViaCookie` for localized error messages.
- **Route modules** (`account`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`, `payments`) – Consumers that mount `getAuth` → `isAuth` → `isAdmin` (or `isAdminViaCookie` for SSE routes) as Express middleware chains before their handlers.

## Notes

- Ordering is significant: `getAuth` must precede `isAuth`, and `isAuth` must precede `isAdmin`. The 401 branch inside `isAdmin` is a defensive guard for a future mount that skips `isAuth`.
- `getAuth` is deliberately non-rejecting; it is safe to place on routes that serve both anonymous and authenticated traffic.
- `isAdminViaCookie` is the *only* guard that uses the refresh-token path (`resolveRefreshToken`) rather than the access-token path. It also verifies the token's presence on the user document, so a revoked token is rejected, not just an expired one.
- `isAuth` and `isAdmin` call `rejectResponse` without a message array (server-generated 401/403 bodies); `isAdminViaCookie` passes explicit i18n messages because its callers are browsers (SSE) that display them.
- The i18n import comes from `@infrastructure/i18n` (the barrel), not from `context.ts` directly.
