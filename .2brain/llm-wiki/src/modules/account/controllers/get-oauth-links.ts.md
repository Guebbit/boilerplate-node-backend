---
source: src/modules/account/controllers/get-oauth-links.ts
source_sha256: 75ab3a9f541d7934a231ea76806ccca54f9b46f1d981ed2db8a225611b813e71
context_sha256: 05bcd8267e5fefe450fab55b5f80f2a93d1513675014d1c7c4b734a99916a790
generated_at: 2026-11-22T03:21:38.814622+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-oauth-links.ts

## Purpose
Controller for `GET /account/oauth/links`. It is a thin HTTP adapter that returns the authenticated caller's connected sign-in providers, with when each was connected, by delegating to `accountService.listOAuthLinks`.

## Key elements
- `getOAuthLinks(request, response)`: the only export. It reads the caller's id from `request.authContext!.id` and calls `accountService.listOAuthLinks(id)`. It maps the result through `presentOAuthLinks` and sends it with `successResponse<OAuthLinks>`. Any rejection goes to `catchAs(response, 'getOAuthLinks')`.

## Relationships
- `src/modules/account/services/index.ts`: supplies `accountService`, which does the actual lookup of OAuth links.
- `src/modules/account/presenter.ts`: supplies `presentOAuthLinks`, which shapes the service result for the response.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which writes the success response.
- `src/infrastructure/http/controller.ts`: supplies `catchAs`, which handles errors and uses the label `'getOAuthLinks'`.
- `src/types/index.ts`: supplies the `OAuthLinks` type (imported as `@types`), used as the generic parameter of `successResponse`.
- `src/modules/account/routes.ts`: the route module that registers this handler for the endpoint. This is inferred from the module doc and the neighbor graph, because the file itself doesn't reference it.

## Notes
- `request.authContext!` is a non-null assertion. The handler assumes auth middleware has already populated `authContext`, and it does no check of its own.
- The handler is promise-chained and not `async`. Errors are handled only through the trailing `.catch(catchAs(...))`.
