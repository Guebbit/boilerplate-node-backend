---
source: src/modules/delivery/controllers/get-fulfillment-order.ts
sha256: f4682d2b3d4ebd3a607f2d5190b262e262c0c4eddddf2c213e183500707b4e7b
generated_at: 2026-11-08T05:26:27.606414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-fulfillment-order.ts

## Purpose

Thin Express handler for `GET /delivery/fulfillment-orders/:id`. It validates the route parameter, delegates to the delivery service, and maps the service result to an HTTP response. Exists as the single HTTP-facing entry point for fetching one fulfillment order (buyer-scoped or staff-visible, per the service layer).

## Key elements

- **`getFulfillmentOrder`** (exported const) – Express route handler. Reads the `id` param via `requireId`, calls `deliveryService.getFulfillmentOrder(id, request.authContext)`, then either short-circuits on a refusal, sends a `successResponse`, or routes the error through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** – Provides `catchAs` (error-to-response mapping) and `refused` (checks a result for an authorization/denial signal).
- **`@infrastructure/http/ids`** – Provides `requireId`, which extracts the `:id` route param and responds 404 with a localized key if missing.
- **`@infrastructure/http/response`** – Provides `successResponse`, the standard 200 JSON envelope.
- **`../services`** (delivery services barrel) – Source of `deliveryService.getFulfillmentOrder`, the actual business logic and data access.
- **`@types`** – Imports the `FulfillmentOrder` type used to type the response payload.
- **`src/modules/delivery/routes.ts`** – Registers this handler on the `GET /delivery/fulfillment-orders/:id` path (implied by the module doc comment and standard Express routing).

## Notes

- The handler's parameter type is `{ id?: string }` (optional), but `requireId` makes it effectively required at runtime; the optionality is only to satisfy the type signature before extraction.
- Auth context is read from `request.authContext` (set by upstream middleware) and forwarded to the service—this file performs **no** authentication of its own.
- On early return (missing id) the function yields `Promise.resolve()` rather than `undefined`/`void`, keeping the return type uniformly `Promise<void> | void`.
- The `catchAs` key is the literal string `'getFulfillmentOrder'`, which the controller helper presumably uses to select an error-response template.
