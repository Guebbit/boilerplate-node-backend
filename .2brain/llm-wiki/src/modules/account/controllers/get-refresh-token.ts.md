---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: 6621a25e8e1c963c8995452939c388108a406182f37a6c6d5a07c3eaa66ca0ed
generated_at: 2026-11-14T18:32:22.552371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Thin HTTP adapter for `POST /account/refresh`. Exchanges the current refresh cookie for a new short-lived access token **and** a rotated refresh cookie in the same response. Only meaningful in `jwt` session mode; in `cookie` mode the endpoint is a 404 because the single credential never rotates.

## Key elements

- **`getRefreshToken(request, response)`** – the sole export; the Express handler for the route.
  1. Bails with **404** when `getSessionMode() === 'cookie'`.
  2. Reads the refresh token via `readSessionCookie(request)` (HttpOnly cookie, never URL/body).
  3. Calls `accountService.refreshAccessToken(token, callerContextOf(request))`.
  4. On success: fetches `abilitiesOfUser(userId)`, sets the rotated cookie via `createSessionCookie`, increments `authRefreshTotal { status: 'success' }`, and replies with `{ token: accessToken, abilities }`.
  5. On failure: infrastructure errors → 503 (`rejectDatabaseError`); any `TokenRejection` with reason `'idle'` → 401 + `ERROR_CODES.SESSION_IDLE` + i18n message; all other rejections → bare 401. `authRefreshTotal { status: 'failure' }` is recorded for non-infrastructure errors.

## Relationships

- **`src/modules/account/services/index.ts`** – exports `accountService`; the controller calls `.refreshAccessToken` on it to perform the token exchange.
- **`src/modules/account/session/cookies.ts`** – `createSessionCookie` writes the rotated cookie onto the response.
- **`src/modules/account/session/config.ts`** – `getSessionMode` gates the endpoint to `jwt` mode only.
- **`src/modules/account/session/jwt.ts`** – `TokenRejection` is the error type the service throws for unknown/expired/revoked/replayed/idle tokens.
- **`src/modules/account/session/account-view.ts`** – `abilitiesOfUser` re-checks that the user still exists and returns their permission set after rotation.
- **`src/modules/account/metrics.ts`** – `authRefreshTotal` counter incremented on success/failure.
- **`src/modules/account/routes.ts`** – wires this handler to the `POST /account/refresh` path.
- **`src/kernel/cookies.ts`** – `readSessionCookie` extracts the refresh token from the incoming request cookie.
- **`src/infrastructure/http/response.ts`** – `successResponse` / `rejectResponse` shape every reply.
- **`src/infrastructure/http/errors.ts`** – `isInfrastructureError` / `rejectDatabaseError` route infra failures to 503.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` captures request metadata passed into the service call.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** – `t()` localises the idle-session message.
- **`src/infrastructure/adapters/logger.ts`** – used indirectly via `rejectDatabaseError` for structured logging of the 503 path.
- **`src/modules/account/tests/unit/get-refresh-token.test.ts`** – unit tests covering the success, 404, 401 (incl. idle), and 503 branches.

## Notes

- **Uniform 401 on token refusal.** Unknown, expired, revoked, replayed, and revoked-between-rotation tokens all produce the same bare 401. The only exception is `reason === 'idle'`, which carries a distinct `ERROR_CODES.SESSION_IDLE` body so the client can show "signed out for inactivity."
- **503, not 401, for infrastructure outages.** The client treats 401 as a definitive sign-out; a transient DB failure must be retryable, so it is mapped to 503.
- **Cookie rotation is mandatory in the same response.** Without writing the new cookie before the success body, the client would keep presenting the superseded token and rely on the service's grace window on the next call.
- **`abilities` is fetched *after* rotation.** If the account was deleted in the gap, the controller throws `TokenRejection('revoked', …)` and the client receives 401 rather than a partial success.
