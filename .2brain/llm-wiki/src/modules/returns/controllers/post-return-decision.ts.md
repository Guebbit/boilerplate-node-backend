---
source: src/modules/returns/controllers/post-return-decision.ts
source_sha256: 52f17491a9d5039fabf91a44b4785c7795b7c8b9bee27192f88c448819e056ae
context_sha256: 5dcbe4541d7b3acaa2d758291febd1cb624d914dbcc944fb39ba6d54d79f7785
generated_at: 2026-11-22T07:22:04.108279+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/controllers/post-return-decision.ts

## Purpose
Express controllers for staff's answer to a return request: `POST /returns/:id/approve` and `POST /returns/:id/decline`. Each delegates to the return service and responds 200 with the updated return, including its available actions for the caller.

## Key elements
- `postReturnApprove(request, response)` — validates the `:id` param, calls `returnService.approveReturn(id, callerContext)`, and responds with the resulting return.
- `postReturnDecline(request, response)` — same flow, but first parses the request body against the `DeclineReturnBody` schema (imported from `@api/schemas.zod`) and passes it to `returnService.declineReturn(id, body, callerContext)`.

Both handlers follow the same pipeline:
1. `requireId` with `notFound: 'returns.not-found'`; the handler stops if no id is returned (the helper handles the response).
2. (Decline only) `parseBody(DeclineReturnBody, ...)`; stops if parsing fails.
3. Service call, then `refused(response, result)`; if the service refused, the handler stops.
4. Otherwise `successResponse<Return>(response, returnService.withActions(result.data, authContext), 200)`.
5. Rejections are routed to `catchAs(response, '<handlerName>')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `catchAs` (error handling), `parseBody` (schema validation), and `refused` (detects service-level refusal and responds).
- `src/infrastructure/http/ids.ts` — `requireId` validates the route id.
- `src/infrastructure/http/request.ts` — `callerContextOf(request)` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `successResponse` formats the 200 reply.
- `src/modules/returns/services/index.ts` — exports `returnService` (`approveReturn`, `declineReturn`, `withActions`).
- `src/types/index.ts` — provides the `Return` type used in the response.
- `src/modules/returns/routes.ts` — the route wiring that binds these handlers to the two endpoints.

## Notes
- `request.authContext!` is asserted non-null, relying on the `isAuth` middleware having run upstream.
- Approve takes no request body; only decline validates one.
- Handlers return early without a value when a helper has already written the error response.
