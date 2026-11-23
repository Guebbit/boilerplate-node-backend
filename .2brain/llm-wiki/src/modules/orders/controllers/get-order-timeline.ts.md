---
source: src/modules/orders/controllers/get-order-timeline.ts
source_sha256: 6750e742ea4e2aa453ea3f8947475af4dc959db166df3c71326b810ba2d0c6ec
context_sha256: 4c03cf5cfe0ad1df797a7490e629026c2c6afedc57a2765317bfe4ddbcbf9f53
generated_at: 2026-11-22T06:08:27.294165+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/get-order-timeline.ts

## Purpose
Express controller for `GET /orders/:id/timeline`. It returns a page of an order's history (what happened to it), newest first, as the caller is allowed to read it. The order is resolved through the same caller scope as `GET /orders/:id`, so an order the caller cannot see yields the same 404.

## Key elements
- `timelineQuerySchema` (module-private): `GetOrderTimelineQueryParams` (a generated schema imported from `@api/schemas.zod`) extended with the infra `pageSchema`/`pageSizeSchema` (coercing) and made fully `.partial()`, so every param is optional. Per the source comment, the object is strict, so a stray key produces a 422.
- `getOrderTimeline(request, response)` (exported): the handler. Steps:
  1. `requireId` reads `:id`, answering a not-found with the `orders.not-found` message when it is missing or invalid.
  2. `parseBody` validates the query params, read via `readInput(request, { surface: 'list' })`. A GET has no body.
  3. `orderService.getForCaller(id, request.authContext)`. If no order is returned, it responds 404 with `t('orders.not-found')`.
  4. `orderService.readTimeline(id, request.authContext, query)` fetches the page, sent as `successResponse<OrderTimelineResponse>(..., 200)`.
  5. Any rejection is routed through `catchAs(response, 'getOrderTimeline')`.

## Relationships
- `src/infrastructure/http/*` (`ids`, `request`, `response`, `schemas`, `controller`): provide ID extraction, input reading, the success/reject envelopes, the page/pageSize schemas, and the `parseBody`/`catchAs` helpers.
- `src/infrastructure/i18n` (`t`): localizes the 404 message.
- `src/modules/orders/services` (`orderService`): supplies `getForCaller` (visibility check) and `readTimeline` (data and role-based filtering).
- `src/types`: supplies the `OrderTimelineResponse` type.
- `src/modules/orders/routes.ts`: the route registration that wires this handler to the endpoint.

## Notes
- Visibility differs by role, as documented in the handler's comment: staff see every row and its actor, while the buyer sees only buyer-visible types and never an actor. The filtering lives in the service, not in this file.
- The existence/visibility check and the timeline read are two separate service calls, so a hidden order never reaches `readTimeline`.
- The handler returns `Promise<void> | void`. Early exits (invalid id, invalid query) return synchronously.
