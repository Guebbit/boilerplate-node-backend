---
source: src/modules/account/controllers/delete-oauth-link.ts
source_sha256: d6235d0c05c8d71a9250b84336c1644a620db08a030ad09f2069f537488a9c02
context_sha256: 75cd71b71547eb58f7b7469ac55cb3ee6a01f0fcf2da1f5da774bab6974cb5aa
generated_at: 2026-11-22T03:20:40.940699+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/delete-oauth-link.ts

## Purpose
Express controller for `DELETE /account/oauth/links/{provider}`. It is a thin HTTP adapter over `accountService.unlinkOAuthProvider`. It disconnects one OAuth provider from the caller's account and returns the caller's updated list of links.

## Key elements
- `deleteOAuthLink(request, response)`: the exported handler. `request` is typed `Request<{ provider: string }>`.
  1. Calls `accountService.unlinkOAuthProvider(request.authContext!.id, request.params.provider, callerContextOf(request))`.
  2. If the service returns a falsy value (provider was not linked), responds 404 through `rejectResponse` with `t('account.oauth.link-not-found')`.
  3. Otherwise calls `accountService.listOAuthLinks(authContext.id)`. It responds 200 with `successResponse<OAuthLinks>(response, presentOAuthLinks(links), 200)`.
  4. Any rejection goes to `catchAs(response, 'deleteOAuthLink')`.

## Relationships
- `../services` (`accountService`): supplies `unlinkOAuthProvider` and `listOAuthLinks`.
- `../presenter`: `presentOAuthLinks` shapes the links list for the response.
- `@infrastructure/http/response`: `successResponse` and `rejectResponse` build the HTTP responses.
- `@infrastructure/http/controller`: `catchAs` handles errors.
- `@infrastructure/http/request`: `callerContextOf` extracts the caller context from the request and passes it to the service.
- `@infrastructure/i18n`: `t` translates the 404 message.
- `@types`: provides the `OAuthLinks` response type.
- `../routes`: mounts this handler on the route. Per the file's doc comment, the route also adds a fresh-session guard.

## Notes
- The handler uses `request.authContext!` (non-null assertion). It relies on upstream auth middleware having set the context.
- The fresh-session guard is applied by the route, not in this file. The doc comment says removing a way in counts as an identity change.
- On success the response body is the full updated links list, not just the removed link.
- On the 404 path the handler returns `undefined` after calling `rejectResponse`, so `listOAuthLinks` is not called.
