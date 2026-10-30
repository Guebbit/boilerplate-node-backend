---
source: src/modules/account/controllers/get-oauth-links.ts
sha256: 75ab3a9f541d7934a231ea76806ccca54f9b46f1d981ed2db8a225611b813e71
generated_at: 2026-10-29T02:27:21.685987+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-links.ts

## Purpose

Thin Express controller that handles `GET /account/oauth/links`. It resolves the authenticated user's ID, delegates to `accountService.listOAuthLinks`, transforms the result through the account presenter, and returns the formatted list of connected sign-in providers (with their connection timestamps).

## Key elements

- **`getOAuthLinks(request, response)`** — The sole export. A promise-chain handler that:
  1. Extracts `request.authContext!.id` as the user identifier.
  2. Calls `accountService.listOAuthLinks(id)`.
  3. Maps the raw result through `presentOAuthLinks`.
  4. Sends the payload via `successResponse` (typed as `OAuthLinks`).
  5. Routes any rejection to `catchAs(response, 'getOAuthLinks')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService`; calls its `listOAuthLinks` method to fetch the user's linked providers.
- **`src/modules/account/presenter.ts`** — Imports `presentOAuthLinks` to shape the service's raw output into the API-facing `OAuthLinks` representation.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to send the 200 JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` to convert thrown/rejected errors into a consistent error response, tagged with the controller name `'getOAuthLinks'`.
- **`src/types/index.ts`** — Imports the `OAuthLinks` type to type-parameterize `successResponse`.
- **`src/modules/account/routes.ts`** — Registers this handler at the `/account/oauth/links` route (the controller exists to be mounted there).

## Notes

- Uses the non-null assertion `request.authContext!.id`, meaning the route is expected to be behind an auth middleware that guarantees `authContext` is populated. Calling this endpoint without that middleware will throw at runtime.
- Error handling is entirely delegated to `catchAs`; there is no local try/catch or status-code branching in this file.
- The controller is a one-liner promise chain (`.then(...).catch(...)`) — no async/await — consistent with the project's `catchAs` pattern.
