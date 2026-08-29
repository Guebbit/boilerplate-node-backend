# src/modules/orders/controllers/write-orders.ts

## Purpose

Single-entry HTTP controller for admin-side order mutations: creating a new order from an explicit payload or updating an existing order by ID. It validates the request body against Zod schemas, delegates to `orderService`, and shapes the HTTP response. It exists as a thin translation layer between Express routing and the order domain service.

## Key elements

- **`writeOrders`** — The sole export. Accepts an Express `Request`/`Response` pair and branches on the presence of an order `id`:
  - **No `id` (POST):** Validates body with `CreateOrderBody`, calls `orderService.create`, increments the `orderCreatedTotal` metric, and returns `201`. A `PUT` without an `id` short-circuits with `422`.
  - **`id` present (PUT):** Chooses `UpdateOrderByIdBody` (path-param id) or `UpdateOrderBody` (body id) based on `request.params.id`, validates, calls `orderService.updateById`, and returns the updated order.
- Both branches use `callerContextOf(request)` to pass locale/auth context into the service and `orderService.withActions(...)` to attach permitted action metadata to the response payload.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@modules/orders/service` | Calls `orderService.create`, `orderService.updateById`, `orderService.withActions`. |
| `@modules/orders/metrics` | Increments `orderCreatedTotal` on successful creation. |
| `@infrastructure/http/controller` | Uses `catchAs` (error mapping), `refused` (result short-circuit), `rejectValidation` (Zod error → 422). |
| `@infrastructure/http/request` | Uses `readInput` to unify path-param and body id extraction; `callerContextOf` for locale context. |
| `@infrastructure/http/response` | Uses `successResponse` and `rejectResponse` for all HTTP output. |
| `@infrastructure/i18n` | Calls `t('generic.error-missing-data')` for the 422 message. |
| `@types` | Types the `Request` generic with `CreateOrderRequest`, `UpdateOrderRequest`, `UpdateOrderByIdRequest`. |
| `@modules/orders/routes` | Expected consumer that wires `writeOrders` to the `POST /orders` and `PUT /orders` routes (not visible in this file). |

## Notes

- **Two Zod schemas for one route:** `UpdateOrderBody` (id in body) vs. `UpdateOrderByIdBody` (id in path) are selected at runtime via `request.params.id`. They share the same update fields but differ in where the id lives.
- **PUT without id is 422, not 400 or 404.** This is an intentional semantic choice: the method is correct, the payload is simply incomplete.
- **Metric increment lives here, not in the service.** `orderCreatedTotal.inc()` sits in the controller's `.then()` chain, meaning it only fires when the HTTP call succeeds and the result is not `refused`.
- **Early-exit returns use `Promise.resolve()`.** This keeps every code path returning a `Promise`, which matters for the caller (Express async handling / route wrappers).
- **Admin vs. checkout:** The file's docblock notes that items come straight from the request body, bypassing the cart flow in `@modules/cart`. Do not conflate this with the user-facing checkout path.
- **`readInput` single-declaration pattern:** The id is read once via `readInput(request, { surface: 'write', ids: ['id'] })` rather than separately from `request.params.id` and `request.body`. See `docs/theory/request-input.md` referenced in the source comment.
