---
source: src/modules/returns/controllers/post-return-decision.ts
sha256: 52f17491a9d5039fabf91a44b4785c7795b7c8b9bee27192f88c448819e056ae
generated_at: 2026-11-08T07:56:36.352034+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return-decision.ts

## Purpose

Thin Express handlers for the two staff-facing decision actions on a return request: **approve** (`POST /returns/:id/approve`) and **decline** (`POST /returns/:id/decline`). Each validates the route id (and, for decline, the request body), delegates to `returnService`, and responds with HTTP 200 carrying the updated `Return` object enriched with action metadata.

## Key elements

- **`postReturnApprove`** – Resolves the return id via `requireId`, obtains the caller context, calls `returnService.approveReturn(id, callerContext)`. No request body is expected.
- **`postReturnDecline`** – Same id-resolution, then parses and validates the body against the `DeclineReturnBody` Zod schema before calling `returnService.declineReturn(id, body, callerContext)`.
- Both handlers follow the same `.then / .catch` pattern: `refused` short-circuits on a rejected result, `successResponse` wraps the success payload, and `catchAs` maps unexpected errors to a 500.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies the shared error/validation helpers `catchAs`, `parseBody`, and `refused` used by both handlers.
- **`src/infrastructure/http/ids.ts`** – `requireId` extracts and validates the `:id` route parameter, responding with a `404` (`returns.not-found`) if missing.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` reads the authenticated caller's identity from the request for service-level scoping.
- **`src/infrastructure/http/response.ts`** – `successResponse` builds the JSON 200 envelope.
- **`src/modules/returns/routes.ts`** – Registers `postReturnApprove` and `postReturnDecline` on the Express router for their respective paths.
- **`src/modules/returns/services/index.ts`** – Exports `returnService`, which contains the business logic for `approveReturn`, `declineReturn`, and the `withActions` enrichment.
- **`src/types/index.ts`** – Provides the `Return` domain type used as the response payload generic.

## Notes

- Both endpoints are **POST** (not PUT/PATCH) by design — they model discrete staff *actions* rather than resource updates.
- `request.authContext!` is non-null-asserted in both handlers; correctness depends on the `isAuth` middleware running before the controller. If the middleware is removed or reordered, these will throw.
- The **approve** path takes no body; the **decline** path requires a `DeclineReturnBody` (e.g., a reason). They are intentionally asymmetric.
- `returnService.withActions(result.data, authContext)` is called in the controller, not inside the service method, so the action metadata is context-aware at the HTTP layer.
