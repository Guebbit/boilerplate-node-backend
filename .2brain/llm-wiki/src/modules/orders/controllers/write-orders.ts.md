---
source: src/modules/orders/controllers/write-orders.ts
sha256: 4d4c1d02907facad40e90ed2545f5c89128994ef3abfd484ac4fd6ccf5fb6d10
generated_at: 2026-09-23T19:01:09.478890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/write-orders.ts

## Purpose

Admin-side create/update controller for orders. A single exported handler covers both `POST /orders` (create) and `PUT /orders(/:id)` (update), branching on whether an order id is present. It deliberately bypasses the cart flow — items arrive directly in the request body — distinguishing it from the customer checkout path in the cart module.

## Key elements

- **`writeOrders`** (exported) — The sole handler. Reads an optional `id` via `readInput`, then:
    - _No id (POST):_ Validates body against `CreateOrderBody`, calls `orderService.create`, increments `orderCreatedTotal`, enriches the result with `orderService.withActions`, and responds **201**.
    - _No id (PUT):_ Immediately returns **422** with an i18n "missing data" error.
    - _Id present (PUT):_ Chooses between `UpdateOrderByIdBody` (id from path) and `UpdateOrderBody` (id in body) based on `request.params.id`, validates, calls `orderService.updateById`, enriches with `withActions`, and responds **200**.
- **Validation** — All parsing uses Zod `safeParse`; failures short-circuit through `rejectValidation`.
- **Error handling** — `.catch(catchAs(response, …))` on both paths; `refused(response, result)` guards against service-level rejections before responding.

## Relationships

| Neighbor                                | Interaction                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/orders/routes.ts`          | Registers `writeOrders` as the handler for the POST and PUT order routes.                                                        |
| `src/modules/orders/services/index.ts`  | Calls `orderService.create`, `orderService.updateById`, and `orderService.withActions`.                                          |
| `src/infrastructure/http/request.ts`    | Uses `readInput` to extract the optional path id and `callerContextOf` to build the caller/locale context passed to the service. |
| `src/infrastructure/http/response.ts`   | Emits `successResponse` (200/201) and `rejectResponse` (422).                                                                    |
| `src/infrastructure/http/controller.ts` | Uses `catchAs` for error mapping, `refused` for service rejection checks, and `rejectValidation` for Zod failures.               |
| `src/infrastructure/i18n/index.ts`      | Imports `t` to localise the 422 error message.                                                                                   |
| `src/modules/orders/metrics.ts`         | Increments the `orderCreatedTotal` Prometheus counter on successful creation.                                                    |
| `src/types/index.ts`                    | Imports request-body types (`CreateOrderRequest`, `UpdateOrderRequest`, `UpdateOrderByIdRequest`) and the `Order` response type. |

## Notes

- **Two update schemas.** `UpdateOrderByIdBody` expects the id in the URL path; `UpdateOrderBody` expects it in the JSON body. The controller picks one at runtime via `request.params.id ? … : …` — not via a route-level discriminator.
- **Metric ownership.** `orderCreatedTotal.inc()` lives in the controller (after the service call succeeds), not inside `orderService.create`. If you move the metric, keep it out of the service.
- **Mail side-effect.** The confirmation email is sent inside `orderService.create`, not here. The locale it uses comes from `callerContextOf(request)` → `CallerContext.locale`.
- **PUT-without-id is 422, not 400/404.** This is a deliberate "you must supply the id" contract, not a validation failure of the body.
