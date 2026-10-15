---
source: src/modules/orders/controllers/get-order-timeline.ts
sha256: 1b47c01a7607283dbcff23279f99653b2379a8d1a8f39e1d369cad863db13c7a
generated_at: 2026-10-15T10:59:37.618168+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-timeline.ts

## Purpose

Express controller for `GET /orders/:id/timeline`. Returns the order's event timeline filtered by the caller's role: staff see every entry and its actor; buyers see only buyer-visible entry types and never an actor. The order must be visible to the caller, otherwise a 404 is returned (same scope as `GET /orders/:id`).

## Key elements

- **`getOrderTimeline`** (exported) — The sole handler. Validates the `:id` param, confirms the caller can see the order via `orderService.getForCaller`, then fetches and returns the timeline via `orderService.readTimeline`. Returns a `Promise<void> | void` (early-return path on bad ID).

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` to convert any rejected promise into a standard error response.
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to extract and validate the order ID, short-circuiting with a 404 (`orders.not-found`) when missing.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` and `rejectResponse` for all HTTP replies.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` to produce localized error strings.
- **`src/modules/orders/routes.ts`** — Wires this handler to the `GET /orders/:id/timeline` route.
- **`src/modules/orders/services/index.ts`** — Imports `orderService` for `getForCaller` (visibility check) and `readTimeline` (data fetch).
- **`src/types/index.ts`** — Imports the `OrderTimelineEntry` type used as the response payload shape.

## Notes

- The controller performs a **two-step service call**: `getForCaller` (visibility gate) followed by `readTimeline` (data). This means the service layer handles both the "can this caller see this order?" and "what does this caller get to see in the timeline?" logic — the controller adds no filtering itself.
- The `Promise<void> | void` return type reflects the early `return` after a failed `requireId` call; consumers (Express) simply need a function that either resolves or responds directly.
- Role-based filtering (staff vs. buyer visibility, actor suppression) is documented in the JSDoc but enforced entirely inside `orderService.readTimeline`, not here.
