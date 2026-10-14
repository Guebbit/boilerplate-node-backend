---
source: src/modules/account/controllers/get-oauth-links.ts
sha256: f7ef8913fefe1d76dabbb427d6c835e5632f58d4b18207e849e4314d47b438f8
generated_at: 2026-10-14T08:31:35.099811+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-links.ts

## Purpose

Thin HTTP adapter for `GET /account/oauth/links`. It delegates to `accountService.listOAuthLinks`, shapes the result into a JSON-safe payload, and hands the response to Express. Exists to keep routing/wiring logic in the routes file and business logic in the service, with only the request→response mapping here.

## Key elements

- **`getOAuthLinks`** *(exported arrow function)* — Express handler `(request, response) => void`. Calls `accountService.listOAuthLinks(request.authContext!.id)`, maps each link's `connectedAt` Date to an ISO string, wraps the array in `{ links: [...] }`, and sends it via `successResponse<OAuthLinks>`. Errors are funnelled to `catchAs(response, 'getOAuthLinks')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, the shared error-catch helper that converts a rejected promise into an HTTP error response.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the typed 200-response builder used to serialise the payload.
- **`src/modules/account/services/index.ts`** — source of `accountService.listOAuthLinks`, the actual data-fetching call this controller wraps.
- **`src/types/index.ts`** — defines the `OAuthLinks` type that parameterises `successResponse` and documents the response shape.
- **`src/modules/account/routes.ts`** — the route file that registers `GET /account/oauth/links` and binds this handler (with auth middleware) to the path.

## Notes

- `request.authContext!` uses a non-null assertion — the caller (routes) is expected to have applied an auth middleware that populates `authContext`. If you add this handler to a route without that middleware, it will throw at runtime.
- Date → `toISOString()` conversion happens here, not in the service, so the service returns raw `Date` objects and the controller owns the wire-format decision.
- The `.catch(catchAs(...))` pattern means this handler never throws synchronously; unhandled rejections are converted to a standard error response by the shared helper.
