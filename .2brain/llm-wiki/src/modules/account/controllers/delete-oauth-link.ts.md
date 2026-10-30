---
source: src/modules/account/controllers/delete-oauth-link.ts
sha256: d6235d0c05c8d71a9250b84336c1644a620db08a030ad09f2069f537488a9c02
generated_at: 2026-10-29T02:26:07.220413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-oauth-link.ts

## Purpose

Thin HTTP adapter that handles `DELETE /account/oauth/links/{provider}`. It delegates the actual unlinking to `accountService.unlinkOAuthProvider` and, on success, returns the caller's *current* list of remaining OAuth links.

## Key elements

- **`deleteOAuthLink(request, response)`** — the sole export. Reads the provider name from `request.params`, the user id from `request.authContext`, and the caller context; calls the service; responds 404 (i18n `account.oauth.link-not-found`) if the link did not exist, or 200 with the reshaped links list if it did.

## Relationships

- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the HTTP reply.
- **`@infrastructure/http/controller`** — `catchAs` wraps the promise chain for uniform error handling.
- **`@infrastructure/http/request`** — `callerContextOf` extracts IP/UA metadata passed to the service layer.
- **`@infrastructure/i18n`** — `t` resolves the 404 message key.
- **`@modules/account/services`** — `accountService.unlinkOAuthProvider` and `accountService.listOAuthLinks` perform the domain work.
- **`@modules/account/presenter`** — `presentOAuthLinks` maps raw link records to the wire shape.
- **`@types`** — `OAuthLinks` is the declared response body type.
- **`@modules/account/routes.ts`** — mounts this handler on the `DELETE /account/oauth/links/:provider` path (alongside a fresh-session guard).

## Notes

- `request.authContext!` uses a non-null assertion; the controller assumes an upstream auth middleware has already populated it. It will throw at runtime if the route is reached unauthenticated.
- The fresh-session guard mentioned in the doc-comment lives in **routes.ts**, not here.
- The 200 body is the *full remaining* links list (fetched in a second service call), not the single removed entry — a deliberate convention so the client's local state stays in sync.
