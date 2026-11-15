---
source: src/modules/orders/controllers/get-order-timeline.ts
sha256: 6926092ec6c45efdb17bba5eae7eb6f3bb191a96a8132317808b422273bad429
generated_at: 2026-11-14T20:32:15.475347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-timeline.ts

## Purpose

Controller for `GET /orders/:id/timeline`. Returns a paginated, newest-first list of events that happened to a given order, filtered by what the caller is allowed to see. The order is resolved through the same visibility scope as `GET /orders/:id`, so an invisible order produces the same 404.

## Key elements

- **`getOrderTimeline(request, response)`** — the sole export. Validates the order id, parses optional pagination query params, fetches the order for the caller (404 if not visible), then reads the timeline page via `orderService.readTimeline` and returns it as `OrderTimelineResponse`.
- **`timelineQuerySchema`** — a Zod schema built by extending `GetOrderTimelineQueryParams` with optional `page` / `pageSize` (both from the coercing infra pair). The result is `.partial()`, so all keys are optional but a stray key still triggers a 422.

## Relationships

- **`src/modules/orders/services/index.ts`** — the imported `orderService` is used for two calls: `getForCaller` (visibility check, 404 if the caller cannot see the order) and `readTimeline` (actual paginated data fetch). All business logic lives in that module.
- **`src/infrastructure/http/controller.ts`** — `parseBody` validates the query object against the schema; `catchAs` wraps the promise chain into a standard error response.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param, short-circuiting with a 404 if absent.
- **`src/infrastructure/http/request.ts`** — `readInput(request, { surface: 'list' })` gathers the GET query-string into the object passed to schema parsing.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` emit the final HTTP envelope.
- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema` (the "coercing infra pair" that coerces string → number with a default).
- **`src/infrastructure/i18n/index.ts`** — provides the `t` translation function used for the 404 message key.
- **`src/modules/orders/routes.ts`** — registers `getOrderTimeline` on the `GET /orders/:id/timeline` route.
- **`src/types/index.ts`** — supplies the `OrderTimelineResponse` type used in the success-response generic.

## Notes

- Staff callers see every timeline row and its actor; buyers see only buyer-visible event types and never the actor. That filtering is handled inside the service layer, not in this controller.
- Despite the name `parseBody`, no request body is read here — `readInput` with `surface: 'list'` collects query-string params for this GET endpoint.
- The 404 path is duplicated: `requireId` handles a missing/invalid `:id` param, and the service call handles an order the caller cannot see. Both emit the same i18n message key.
