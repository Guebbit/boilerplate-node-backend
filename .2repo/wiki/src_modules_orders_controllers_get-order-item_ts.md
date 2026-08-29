# src/modules/orders/controllers/get-order-item.ts

## Purpose

Handler for `GET /orders/:id`. Validates the path parameter, fetches the order through the order service with a role-scoped caller context, and returns it (or a 404) with a set of actions the requesting caller may perform.

## Key elements

- **`getOrderItem`** (exported) — The sole handler. Accepts Express `Request<{ id?: string }>` / `Response`, performs the full request lifecycle: validate → query → respond or error.
- **ObjectId pre-check** — Calls `isValidObjectId` *before* invoking the service. This is deliberate: the admin branch (`findById`) raises a Mongoose `CastError`, while the scoped branch (an aggregate with `$match`) raises a driver `BSONError` that the response layer would map to 422. Checking up front guarantees a consistent 404 regardless of which branch would have run.
- **Role-scoped fetch** — `orderService.getById(id, orderService.callerScope(request.authContext))` lets the service decide whether the caller sees all orders (admin) or only their own.
- **Action-augmented response** — On success the order is wrapped with `orderService.withActions(order, request.authContext)`, so the client renders its available controls from the server's answer rather than a static client-side lifecycle.
- **i18n** — All user-facing messages go through `t('orders.not-found')`.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers this handler on `GET /orders/:id`.
- **`src/modules/orders/service.ts`** — Provides `getById`, `callerScope`, and `withActions`; this controller delegates all data access and authorization logic to it.
- **`src/infrastructure/http/request.ts`** — Source of `isValidObjectId`, used for the pre-query guard.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse` / `rejectResponse`, the standard response emitters.
- **`src/infrastructure/http/controller.ts`** — Source of `catchAs`, which converts service rejections into an HTTP error response and logs under the `'getOrderItem'` label.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Source of the `t` translation function used for the 404 message.

## Notes

- The 404 is returned for *both* "malformed id" and "no matching order" — intentionally indistinguishable to the client.
- The pre-check exists solely because the two role branches fail with *different* error classes for the same bad input; without it the status code would depend on whether the caller is admin.
- The handler never touches Mongoose or the database directly; all persistence and scoping live in `orderService`.
