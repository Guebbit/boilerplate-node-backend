# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose

Public Express route handler for `GET /delivery/methods`. It exposes the shop's available shipping methods (flat rates and free-above thresholds) to unauthenticated guests so they can see shipping costs before signing up.

## Key elements

- **`getShippingMethods`** (exported const) — The sole handler. Ignores the request body, calls `deliveryService.listMethods()`, and writes the result via `successResponse`. No error branch is visible; the service is expected to never reject here.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers `getShippingMethods` as the handler for the `GET /delivery/methods` path.
- **`src/modules/delivery/service.ts`** — Source of the data: `deliveryService.listMethods()` performs the actual lookup of shipping method records.
- **`src/infrastructure/http/response.ts`** — Provides the `successResponse` helper that serializes the service result into a uniform HTTP success envelope.

## Notes

- The `_request` parameter is intentionally unused (underscore prefix). This is a read-only, parameter-less endpoint; no query strings or path params are read.
- The handler is synchronous (no `async`/`await`). If `listMethods()` ever becomes async, this will need updating and an error path added.
- No validation or auth middleware is applied at this layer; public access is the intended design per the doc comment.
