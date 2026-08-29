# src/modules/delivery/controllers/get-shipment-by-order.ts

## Purpose

Express route handler for `GET /delivery/order/:orderId`. Returns the parcel details (tracking code, arrival status) associated with a given order. It exists so the order page's shipping panel can fetch shipment data once the order status reaches `shipped`.

## Key elements

- **`getShipmentByOrder`** (default-style named export) — Arrow-function Express handler. Reads `request.params.orderId`, calls `deliveryService.getForOrder(orderId, authContext)`, then either sends a success response or handles a refusal. Catches errors via `catchAs`.

## Relationships

- **`@infrastructure/http/response`** — Imports `successResponse`, used to send the resolved `result.data` as the HTTP body.
- **`@infrastructure/http/controller`** — Imports `catchAs` (wraps the rejection path into a standard error response tagged with `'getShipmentByOrder'`) and `refused` (short-circuits when the service result is a refusal, writing the appropriate status/body and returning early).
- **`../service` (`src/modules/delivery/service.ts`)** — Imports `deliveryService`; calls `getForOrder` to perform the actual data retrieval.
- **`src/modules/delivery/routes.ts`** — Registers this handler on the `GET /delivery/order/:orderId` route.

## Notes

- `request.params.orderId` is typed as `string | undefined`, but the handler unconditionally passes `String(request.params.orderId)`. A missing param would be coerced to the literal string `"undefined"` rather than producing a 404 — route-level validation is expected to happen upstream (in `routes.ts`).
- The handler uses a promise chain (`.then` / `.catch`) rather than `async/await`, consistent with the surrounding controller conventions.
- `request.authContext` is forwarded to the service call; no explicit guard is present here, so authentication enforcement is assumed to be middleware applied in `routes.ts`.
