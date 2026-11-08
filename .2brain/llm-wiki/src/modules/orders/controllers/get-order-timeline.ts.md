---
source: src/modules/orders/controllers/get-order-timeline.ts
sha256: a7041fad628ff374886d7a8cdcc8960a9616d852bc6a764ae2b64ab61b7d23ae
generated_at: 2026-11-08T06:45:55.081871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-timeline.ts

## Purpose

Express controller handler for `GET /orders/:id/timeline`. It resolves the order under the caller's visibility scope (same rules as `GET /orders/:id`), then returns the order's timeline entries filtered for that caller—staff see all rows with actor info, buyers see only buyer-visible types with no actor exposed.

## Key elements

- **`getOrderTimeline(request, response)`** — the sole export. Validates the `:id` param, confirms the order is visible to the caller via `orderService.getForCaller`, then fetches and returns `{ items: OrderTimelineEntry[] }` via `orderService.readTimeline`. Returns `404` with a localized message if the order is missing or invisible to the caller.

## Relationships

- **`src/modules/orders/services/index.ts`** — calls `orderService.getForCaller(id, authContext)` for visibility check and `orderService.readTimeline(id, authContext)` to fetch the filtered entries.
- **`src/modules/orders/routes.ts`** — registers this handler on the `GET /orders/:id/timeline` route.
- **`src/infrastructure/http/ids.ts`** — uses `requireId` to extract and validate the `:id` param (early-return on failure).
- **`src/infrastructure/http/response.ts`** — uses `successResponse` for the 200 payload and `rejectResponse` for the 404 path.
- **`src/infrastructure/http/controller.ts`** — wraps the promise chain with `catchAs` to convert unexpected rejections into a structured error response.
- **`src/infrastructure/i18n/index.ts`** — uses `t` to localize the `orders.not-found` message.
- **`src/types/index.ts`** — imports the `OrderTimelineEntry` type used to type the response payload.

## Notes

- The handler performs **two** service round-trips (`getForCaller` then `readTimeline`). The first is a pure visibility gate; the order object itself is discarded. Both calls require the `authContext` from the request.
- `requireId` with `{ notFound: 'orders.not-found' }` handles the case where `:id` is missing entirely (400-style rejection), while the `getForCaller` null-check handles the case where the id exists but the order is invisible (404). These are distinct failure modes.
- The function is a union-return type (`Promise<void> | void`) because of the early `return` after a failed `requireId`; callers (i.e., Express) can ignore this.
