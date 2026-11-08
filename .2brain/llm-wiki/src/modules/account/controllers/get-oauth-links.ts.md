---
source: src/modules/account/controllers/get-oauth-links.ts
sha256: 75ab3a9f541d7934a231ea76806ccca54f9b46f1d981ed2db8a225611b813e71
generated_at: 2026-11-08T04:01:59.478526+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-links.ts

## Purpose

Thin HTTP adapter for the `GET /account/oauth/links` endpoint. It extracts the caller's user ID from the auth context, delegates to `accountService.listOAuthLinks`, shapes the result with a presenter, and writes a standard success or error response. No business logic lives here.

## Key elements

- **`getOAuthLinks(request, response)`** (exported) — Express handler. Calls `accountService.listOAuthLinks(request.authContext!.id)`, pipes the result through `presentOAuthLinks`, and sends it via `successResponse`. Errors are funneled to `catchAs(response, 'getOAuthLinks')`.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 shape.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the uniform error-catch helper used in the `.catch` branch.
- **`src/modules/account/services/index.ts`** — source of `accountService`; the controller calls its `listOAuthLinks` method.
- **`src/modules/account/presenter.ts`** — source of `presentOAuthLinks`, which transforms the raw service output into the wire-format `OAuthLinks` object.
- **`src/types/index.ts`** — defines the `OAuthLinks` type used as the generic parameter of `successResponse`.
- **`src/modules/account/routes.ts`** — registers `getOAuthLinks` as the handler for the `GET /account/oauth/links` route.

## Notes

- `request.authContext!.id` uses a non-null assertion; the controller assumes an upstream auth middleware has already populated `authContext`. If that middleware is skipped, this will throw a TypeError before reaching the service.
- The handler is a promise chain (`.then`/`.catch`) rather than `async/await`, consistent with the `catchAs` pattern used across the codebase's controllers.
