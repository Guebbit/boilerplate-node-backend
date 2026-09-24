---
source: src/modules/account/controllers/delete-session.ts
sha256: 392fbcdd6c0a646bd1962c4f7b622e448ba03e37b26c33b7fbda34b59b5fcbff
generated_at: 2026-09-23T17:59:32.916331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-session.ts

## Purpose
Thin HTTP adapter that exposes `DELETE /account/sessions/:sessionId`, allowing an authenticated user to revoke one of their own refresh-token sessions ("log out that device"). It delegates all business logic to `accountService.sessionRevoke` and maps the result to a success or 404 JSON response.

## Key elements
- **`deleteSession`** (exported) — Express route handler. Reads `request.authContext.id` and `request.params.sessionId`, calls `accountService.sessionRevoke(id, sessionId, callerContextOf(request))`, then returns 200 with a localized "revoked" message or 404 with a localized "not-found" message when `modifiedCount` is 0. Errors are funneled to `catchAs(response, 'deleteSession')`.

## Relationships
- **`src/modules/account/routes.ts`** — registers this handler for the `DELETE /account/sessions/:sessionId` route (upstream caller in the request lifecycle).
- **`src/modules/account/services/index.ts`** — source of `accountService.sessionRevoke`, the sole business-logic call this controller makes.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` / `rejectResponse` used to shape the JSON reply.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the standardized error-to-response mapper used in the `.catch` branch.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which extracts IP/UA context forwarded to the service for audit or rate-limiting purposes.
- **`src/infrastructure/i18n/index.ts`** — provides the `t` translation function for user-facing messages.

## Notes
- `request.authContext!` uses a non-null assertion; the file relies on an `isAuth` middleware guaranteeing authentication before this handler runs. No local auth check is performed.
- Revoking the caller's *current* session is explicitly allowed and behaves like `POST /account/logout` except it does **not** clear cookies (this endpoint is meant to target a different client's session).
- The service filters to the caller's document and `type: 'refresh'`, so foreign session IDs, pending reset/verify tokens, and malformed ObjectIds all surface as 404 or 422 without any extra logic here.
