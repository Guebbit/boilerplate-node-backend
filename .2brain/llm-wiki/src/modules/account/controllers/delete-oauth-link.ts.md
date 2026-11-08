---
source: src/modules/account/controllers/delete-oauth-link.ts
sha256: d6235d0c05c8d71a9250b84336c1644a620db08a030ad09f2069f537488a9c02
generated_at: 2026-11-08T04:00:48.195262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-oauth-link.ts

## Purpose

Thin HTTP adapter for `DELETE /account/oauth/links/{provider}`. It delegates the actual unlinking to `accountService.unlinkOAuthProvider`, then returns the caller's updated list of linked OAuth providers. Exists to keep the route handler a trivial mapping between HTTP concerns and the account service.

## Key elements

- **`deleteOAuthLink(request, response)`** – The sole export. Reads `request.authContext!.id` and `request.params.provider`, calls `accountService.unlinkOAuthProvider`, and on success fetches `accountService.listOAuthLinks` and responds with the presented list (200). If `unlinkOAuthProvider` resolves to a falsy `removed` value, responds 404 with the `account.oauth.link-not-found` i18n message. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/account/services/index.ts`** – Consumes `accountService.unlinkOAuthProvider` (the core operation) and `accountService.listOAuthLinks` (to build the response body).
- **`src/modules/account/presenter.ts`** – Calls `presentOAuthLinks` to shape the raw link records into the `OAuthLinks` DTO before sending.
- **`src/modules/account/routes.ts`** – Registers this handler at the `DELETE /account/oauth/links/:provider` path (with a fresh-session guard, per the file doc comment).
- **`src/infrastructure/http/controller.ts`** – Imports `catchAs` to convert thrown/rejected errors into a standardized error response.
- **`src/infrastructure/http/response.ts`** – Uses `successResponse` (200 path) and `rejectResponse` (404 path).
- **`src/infrastructure/http/request.ts`** – Uses `callerContextOf` to extract the IP/UA context passed to the service call.
- **`src/infrastructure/i18n/context.ts` / `src/infrastructure/i18n/index.ts`** – Provides the `t()` function for the 404 message key.
- **`src/types/index.ts`** – Imports the `OAuthLinks` type used as the response payload generic.

## Notes

- The controller performs **two** service calls on the success path (`unlinkOAuthProvider` then `listOAuthLinks`). The response is the *remaining* links, not a confirmation of what was removed.
- The non-null assertion on `request.authContext!` implies the route is always behind authentication; a missing context would crash before reaching the service.
- `unlinkOAuthProvider` returning a falsy value (rather than throwing) is the signal for "was not linked," which maps to 404.
- The file doc comment notes the route mounts a **fresh-session guard** (defined in `routes.ts`), treating the removal of a login method as an identity change requiring re-authentication.
