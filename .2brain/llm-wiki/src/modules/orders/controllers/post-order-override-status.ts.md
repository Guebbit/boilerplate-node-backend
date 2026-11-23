---
source: src/modules/orders/controllers/post-order-override-status.ts
source_sha256: 852dcf99f95775922da01dae1fff170f05ea44fda25a49daf19647bd6dc2c351
context_sha256: cda44a0727528165b0a6d717a2ecf284b1e0325123de2e200f960a674b74d834
generated_at: 2026-11-22T06:09:38.785506+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/post-order-override-status.ts

## Purpose
Express controller for `POST /orders/:id/override-status`, the admin "status-only" override. It is thin wiring onto `orderService.overrideStatus`: it forces an order to a given status `to`, with a `reason`, and with no parcel or email consequences. The route's `requirePermission('override', 'Order')` guard (step-up gated) has already run before this handler.

## Key elements
- `postOrderOverrideStatus(request, response): Promise<void>` — the only export. Flow:
  1. `requireId` extracts the `:id` param (not-found key `orders.not-found`) and returns early if missing.
  2. `parseBody(OverrideOrderStatusBody, ...)` validates the body against the Zod schema from `@api/schemas.zod` and returns early on failure.
  3. Calls `orderService.overrideStatus(id, body.to, body.reason, callerContextOf(request))`.
  4. If `refused(response, result)` reports a refusal, it stops there. Otherwise it calls `respondWithOrder(response, result.data, request.authContext, 'postOrderOverrideStatus')`.
  5. Rejections go to `.catch(catchAs(response, 'postOrderOverrideStatus'))`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `parseBody`, `refused` and `catchAs` for body validation, refusal handling and error mapping.
- `src/infrastructure/http/ids.ts` — `requireId` reads and validates the route id.
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/modules/orders/controllers/respond.ts` — `respondWithOrder` builds the response for the updated order.
- `src/modules/orders/services/index.ts` — provides `orderService`, whose `overrideStatus` performs the override.
- `src/types/index.ts` — provides the `StatusOverrideRequest` type for the request body generic.
- `src/modules/orders/routes.ts` — mounts this handler on the route (and applies the permission guard).

## Notes
- Early-exit paths return `Promise.resolve()`, so the handler always returns a `Promise<void>`.
- The `StatusOverrideRequest` type is only a compile-time annotation. Runtime validation is done by the `OverrideOrderStatusBody` Zod schema.
