---
source: src/modules/account/controllers/get-account.ts
source_sha256: 17a94e651c2f73ab9c7cda2d551a74b33976c6ecb0fc6235a816ba884a1769a5
context_sha256: 5a36d0f5e612c268c8035dd95a9951736cde524e1e10917ea8ec46f84b55e766
generated_at: 2026-11-22T03:21:18.807022+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-account.ts

## Purpose
Express controller for `GET /account`. It is a thin HTTP adapter that returns the authenticated user's full profile, read fresh from the users collection via `accountService.getOwnProfile`. The JWT carries only id/email/username/admin, so echoing it would drop `verifiedAt` and `locale`, which the client needs. The response also includes the caller's abilities and idle clock, so a signed-in reload needs no second call.

## Key elements
- `getAccount(request, response): void` — the exported handler.
  - Responds 401 if `request.authContext` is missing.
  - Otherwise calls `accountService.getOwnProfile(authContext.id, callerContextOf(request))`.
  - Responds 401 if no user is returned (a valid token whose row is gone is treated as a dead session, not a server fault).
  - On success, calls `setEtag(response, user)` and sends `successResponse<AccountView>(response, accountViewOf(user, authContext))`.
  - Promise rejections go to `catchAs(response, 'getAccount')`.

## Relationships
- `src/infrastructure/http/response.ts` — supplies `rejectResponse` (401s) and `successResponse` (the success body).
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/controller.ts` — `catchAs` is the shared error handler for the promise chain.
- `src/infrastructure/http/preconditions.ts` — `setEtag` sets the ETag header on the response.
- `src/modules/account/services/index.ts` — provides `accountService`, which does the profile lookup.
- `src/modules/account/session/account-view.ts` — `accountViewOf(user, authContext)` builds the response body.
- `src/types/index.ts` — provides the `AccountView` type.
- `src/modules/account/routes.ts` — the neighbor that registers this handler for the route. The route wiring is not visible in this file.

## Notes
- The role comes from the already-resolved `authContext`, which was read from the membership store at token verification. The handler does no second lookup.
- The ETag has two parts. The edit part is the stored document's revision, which a role change moves (see `src/modules/users/services/update.ts`). The body part changes on every read because of `lastActiveAt`, which `no-store` makes harmless.
- The handler returns `void` and writes to the response directly, so each early `return` after `rejectResponse` is needed to stop the flow.
