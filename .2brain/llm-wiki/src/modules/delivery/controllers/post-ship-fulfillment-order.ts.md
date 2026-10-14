---
source: src/modules/delivery/controllers/post-ship-fulfillment-order.ts
sha256: 35ec32aa8dd8c3b9009d27e8c6ff023dbb50650ba87367322bdb517faf7aaf13
generated_at: 2026-10-14T15:21:46.657332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-ship-fulfillment-order.ts

## Purpose

Express route handler for `POST /delivery/fulfillment-orders/:id/shipments`. Validates the incoming request (id presence, body schema), delegates the "cut a shipment" operation to the delivery service, and maps the result to an appropriate HTTP response (201 with the created `Shipment`, or a rejection/error status).

## Key elements

- **`postShipFulfillmentOrder(request, response)`** (exported) — The sole export. Synchronous Express handler that:
  1. Extracts and validates the `:id` route param via `requireId`.
  2. Parses and validates the JSON body against the `ShipFulfillmentOrderBody` Zod schema.
  3. Calls `deliveryService.shipFulfillmentOrder(id, body, authContext, callerContext)`.
  4. On success, returns `201 Created` with the new `Shipment` and a `Location`-style header to the parent order (`/delivery/order/:orderId`).
  5. On rejection or thrown error, delegates to `refused` / `catchAs` for a standard error response.

## Relationships

- **`@infrastructure/http/controller`** (`catchAs`, `parseBody`, `refused`) — provides the shared guard-and-error utilities that shape every controller in the project.
- **`@infrastructure/http/ids`** (`requireId`) — validates the `:id` route parameter and emits a 404 with the `delivery.fulfillment-order-not-found` code if absent.
- **`@infrastructure/http/request`** (`callerContextOf`) — extracts caller metadata (e.g. API key, user id) from the request for audit/logging passed to the service.
- **`@infrastructure/http/response`** (`createdResponse`) — builds the 201 response envelope including the `Location` header.
- **`../services`** (`deliveryService`) — the domain service that performs the actual shipment-cutting logic; this controller contains no business rules.
- **`@types`** (`Shipment`) — the return shape used to type the 201 response body.
- **`src/modules/delivery/routes.ts`** — imports this handler and binds it to the `POST /delivery/fulfillment-orders/:id/shipments` route.

## Notes

- On validation failure the function returns `Promise.resolve()` (not a plain `return`) to keep the return type consistent as `Promise<void>` for Express's async-handler expectation.
- The `Location`-style header points to the **parent order**, not the shipment itself—consumers should follow that link for order-level state.
- The Zod schema `ShipFulfillmentOrderBody` is imported from `@api/schemas.zod`, which is *not* listed in the local graph neighbors but is a hard dependency for type-safe body parsing.
