# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose
Controller handler for the public `GET /delivery/methods` endpoint. It returns the shop's available shipping methods (flat rates and free-above thresholds) so that guests can see shipping costs before signing up.

## Key elements
- **`getShippingMethods`** (exported) — Express route handler. Delegates to `deliveryService.listMethods()` and sends the result via `successResponse`. The request object is unused (prefixed `_`).

## Relationships
- **`src/modules/delivery/service.ts`** — Imports `deliveryService` and calls its `listMethods()` to obtain the shipping-method list.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the service result into the HTTP response.
- **`src/modules/delivery/routes.ts`** — Registers `getShippingMethods` as the handler for the `GET /delivery/methods` route.

## Notes
- No authentication or authorization checks; this is intentionally a public endpoint.
- The controller is a thin pass-through: all business logic lives in `deliveryService.listMethods()`. Any validation or transformation of the method list belongs in the service, not here.
