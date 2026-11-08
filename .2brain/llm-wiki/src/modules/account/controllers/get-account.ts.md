---
source: src/modules/account/controllers/get-account.ts
sha256: 5754429f7f1441dfbc83ba1a938b5f86d731fbce4dbfd375612ddca0b555204c
generated_at: 2026-11-08T04:01:29.669615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account.ts

## Purpose

Thin HTTP adapter for `GET /account`. Fetches the authenticated user's full profile directly from the database (via `accountService.getOwnProfile`) so the response includes fields the JWT does not carry (`verifiedAt`, `locale`), and returns it shaped as an `AccountView` with an ETag for conditional-request support.

## Key elements

- **`getAccount(request, response)`** — The sole export. Validates the auth context, calls `accountService.getOwnProfile`, sets an ETag, and serialises the result through `accountViewOf`. Returns 401 if no auth context is present or the user row is missing (dead session).
- **`catchAs(response, 'getAccount')`** — Attached to the promise chain to convert thrown errors into a standard error response.
- **`setEtag(response, user)`** — Sets the `ETag` header on the raw stored document (not the response body), so that a role change in a later request cannot cause a stale `If-Match` to 412.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `getAccount` as the handler for the `GET /account` route.
- **`src/modules/account/services/index.ts`** — Provides `accountService.getOwnProfile(id, callerContext)`, the data-fetching call this controller delegates to.
- **`src/modules/account/session/account-view.ts`** — Provides `accountViewOf(user, authContext)` which shapes the DB document + auth context into the `AccountView` wire type (adds abilities, idle clock).
- **`src/types/index.ts`** — Source of the `AccountView` type used in the `successResponse` generic.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract the caller's identity/context from the Express request.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` (401 path) and `successResponse` (200 path).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` for uniform error handling.
- **`src/infrastructure/http/preconditions.ts`** — Provides `setEtag` for the `ETag` header.

## Notes

- **401 on missing row, not 404.** A valid token whose user document has been deleted is treated as a dead session (401), not a server fault. This is intentional.
- **ETag is document-scoped, not body-scoped.** The tag is derived from the stored user document so that a role change written by a concurrent request won't invalidate a previously-issued `If-Match` that the client is still using.
- **No second membership lookup.** The role/abilities in the response come from the already-resolved `authContext` (set during JWT verification), not from a re-query.
