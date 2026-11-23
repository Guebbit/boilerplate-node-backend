---
source: src/modules/shop-tasks/controllers/get-shop-work-summary.ts
source_sha256: 85e67c3b2df2980d100277911ca21381d953f6ab5d0fc54203d4c3b59762d6f9
context_sha256: 69c3f77d0dcf26c7b324442bc52a89e5c4c4e8c0e7cda4fb300f8b2f9e6d533e
generated_at: 2026-11-22T07:40:44.452755+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/controllers/get-shop-work-summary.ts

## Purpose
Express controller for `GET /shop-tasks/summary` (staff only). It returns the counts that drive the staff navigation badges. The controller only delegates to the service and wraps the result in the standard HTTP response.

## Key elements
- `getShopWorkSummary(request, response)`: the only export. It calls `workSummary(request.authContext!)`. On success it sends the counts with `successResponse(response, counts, 200)`. On failure it passes the error to `catchAs(response, 'getShopWorkSummary')`.

## Relationships
- `../services/work-summary`: provides `workSummary`, which takes the auth context and produces the counts. The controller adds no logic of its own.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`): provides `successResponse`, which formats the 200 response.
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`): provides `catchAs`, the shared error handler. The label `'getShopWorkSummary'` is passed to it to identify this controller.
- `src/modules/shop-tasks/routes.ts`: the route layer that mounts this handler on `/shop-tasks/summary`.

## Notes
- The non-null assertion on `request.authContext!` assumes the `isAuth` middleware has already run and set the session. The route must keep that middleware in front of this handler.
- The handler returns a promise chain instead of using `async`/`await`, and the `.catch` handles all errors.
