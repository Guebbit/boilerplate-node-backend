---
source: src/modules/orders/controllers/get-order-timeline.ts
sha256: a7041fad628ff374886d7a8cdcc8960a9616d852bc6a764ae2b64ab61b7d23ae
generated_at: 2026-10-29T04:38:11.511682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-timeline.ts

## Purpose

Handler for `GET /orders/:id/timeline`. Returns the timeline of events for a given order, filtered by the caller's role (staff see all entries with actors; buyers see only buyer-visible types without actors). Authorization is the same scope as `GET /orders/:id`—an order the caller cannot see yields a 404.

## Key elements

- **`getOrderTimeline(request, response)`** — The sole export. Validates the `id` path param, calls `orderService.getForCaller` to confirm the order is visible to the caller (404 otherwise), then calls `orderService.readTimeline` to fetch role-appropriate entries. Responds with `200 { items: OrderTimelineEntry[] }` or a 404 / error.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers `getOrderTimeline` as the handler for the `GET /orders/:id/timeline` route.
- **`src/modules/orders/services/index.ts`** — Provides `orderService`, which performs the actual permission-scoped lookup and timeline read.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps the promise chain for uniform error handling.
- **`src/infrastructure/i18n/index.ts`** — `t` translates the `orders.not-found` message key.
- **`src/types/index.ts`** — Supplies the `OrderTimelineEntry` type used in the response payload.

## Notes

- The controller performs **two** service calls (`getForCaller` then `readTimeline`) rather than a single combined call. The first exists purely to enforce the 404-before-data contract; the second does the real work.
- Role-based filtering (staff vs. buyer, actor visibility) is delegated entirely to `orderService.readTimeline`; the controller contains no branching on role.
- The 404 body uses the i18n key `orders.not-found`, not a hardcoded string.
