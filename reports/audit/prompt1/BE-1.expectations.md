# BE-1 frozen expectations — Order lifecycle, totals, money

Blind read of Tier A only:
- `src/modules/orders/openapi.yaml`
- `shared/contracts/openapi.root.yaml` (schemas referenced by the orders fragment: `Order`,
  `OrderActions`, `OrderStatus`, `CartItem`, `OrderItem`, `ErrorResponse`/`ErrorItem`,
  `HardDeleteParam`)
- `db/migrations/20260810120000-orders-soft-delete.js`
- `db/migrations/20260820140000-order-shipping-cost.js`

No file under `src/` (other than the two `openapi.yaml` contract files above) and no test file
was opened before this file was written and committed.

## Lifecycle / transitions

- **E1.** A `PUT` to `/orders` or `/orders/{id}` that sets `status` to a value the lifecycle does
  not allow from the order's current status (e.g. `delivered` on a `pending` order) is refused
  `409` with `errors[].code = ORDER_TRANSITION_NOT_ALLOWED` and `errors[].details = { from, to,
  allowed }`, where `allowed` lists the moves that ARE open.
  (`src/modules/orders/openapi.yaml:94-98`, `:212-215`)

- **E2.** A `PUT` that sets `status: paid` is refused `409 ORDER_TRANSITION_NOT_ALLOWED`
  regardless of the order's current status — "`paid` on anything" — because only a confirmed
  payment may write that status; no request body can.
  (`src/modules/orders/openapi.yaml:96-98`, `:213-215`; corroborated by
  `shared/contracts/openapi.root.yaml:573-579`, `OrderActions.pay` "not in `transitions`, because
  no request may make that move").

- **E3.** A `PUT` that sets `status: cancelled` is refused `409` with a DIFFERENT code,
  `ORDER_CANCEL_VIA_CANCEL_ENDPOINT` — not `ORDER_TRANSITION_NOT_ALLOWED` — because cancelling is a
  legal move but not a field write; the client must call `POST /orders/{id}/cancel` instead.
  This applies even though `cancelled` may otherwise be a reachable status.
  (`src/modules/orders/openapi.yaml:99-100`, `:216-217`)

- **E4.** A `PUT` that rewrites `items` while the order's stock is still held or already sold is
  refused `409 ORDER_ITEMS_HELD`, because the reservation froze the old lines.
  (`src/modules/orders/openapi.yaml:101-102`, `:218-219`)

- **E5.** `OrderActions.transitions` (on `Order.actions`) never contains the order's current
  status, and is empty `[]` on a terminal order.
  (`shared/contracts/openapi.root.yaml:564-567`)

- **E6.** `OrderActions.pay` is true only while the order is still awaiting payment (can reach
  `paid`); it is never reflected in `transitions`.
  (`shared/contracts/openapi.root.yaml:573-579`)

## Cancellation (`POST /orders/{id}/cancel`)

- **E7.** A non-admin (customer) may cancel an order only while its status is `pending` or
  `paid`. An admin/operator may cancel "one step further" than that pair — i.e. also while
  `processing` (the status immediately after `paid` in the enum ordering
  `pending, paid, processing, shipped, delivered, cancelled`).
  (`src/modules/orders/openapi.yaml:274-277`, enum order at
  `shared/contracts/openapi.root.yaml:545`)

- **E8.** Cancelling an order outside the caller's cancellable set is refused `409` with
  `errors[].code = ORDER_NOT_CANCELLABLE` — the order exists and is visible, but its status is
  past what's cancellable for this caller.
  (`src/modules/orders/openapi.yaml:303-305`)

- **E9.** Cancelling releases the order's held stock in EVERY case (regardless of the `refund`
  flag and regardless of caller role).
  (`src/modules/orders/openapi.yaml:277-278`)

- **E10.** Whether the money is returned is governed by `refund`: a non-admin (customer) is
  ALWAYS refunded and cannot waive it — any `refund: false` sent by a customer is ignored. An
  admin/operator's `refund` choice is honoured as sent.
  (`src/modules/orders/openapi.yaml:278-280`, `:366-368`)

- **E11.** `CancelOrderRequest.refund` defaults to `true` when the body (or the field) is
  omitted — i.e., omitting the cancel body entirely behaves as `refund: true`.
  (`src/modules/orders/openapi.yaml:370-376`)

- **E12.** A non-admin can cancel only their own orders (by `userId`); an admin can cancel any
  order. A cancel attempt on another user's order by a non-admin is not a `409` — it is
  `403`/`404` per the endpoint's declared responses (ownership/visibility), before the
  cancellable-status check applies.
  (`src/modules/orders/openapi.yaml:280-281`, `285-307`)

- **E13.** The ownership/status check and the cancelling write happen as one atomic statement:
  two concurrent cancel attempts against the same order resolve to exactly one winner (the
  other must observe either an already-cancelled state or a conflict, never a double
  stock-release/refund).
  (`src/modules/orders/openapi.yaml:281-282`)

## Money / totals

- **E14.** `Order.totalPrice` = sum of `product.price × quantity` across every line item, PLUS
  `shippingCost` when the checkout chose a shipping method.
  (`shared/contracts/openapi.root.yaml:608-613`)

- **E15.** `Order.totalItems` = the number of distinct line items (not the summed quantity).
  (`shared/contracts/openapi.root.yaml:596-602`)

- **E16.** `Order.totalQuantity` = the sum of `quantity` across every line item.
  (`shared/contracts/openapi.root.yaml:603-607`)

- **E17.** An order that chose no shipping method, or predates the delivery module, has no
  `shippingCost` stored; such a missing value reads as 0 for total-price purposes (not an error,
  not `null`). Migration back-fill set existing rows without a method to `shippingCost: 0`
  going forward, and the schema default for new writes is `0`.
  (`db/migrations/20260820140000-order-shipping-cost.js`; `Order.shippingCost` "Absent on
  orders...that predate delivery" at `shared/contracts/openapi.root.yaml:617-626`)

- **E18.** All money/quantity fields are non-negative: `price ≥ 0`, `shippingCost ≥ 0`,
  `totalPrice ≥ 0`, `quantity ≥ 1` (both `CartItem.quantity` and `OrderItem.quantity`).
  (`shared/contracts/openapi.root.yaml:503-509` CartItem, `:539-541` OrderItem,
  `:608-611` totalPrice)

## Delete / hardDelete

- **E19.** `hardDelete` is boolean, default `false`. It can be supplied via path (`/orders/{id}
  /hard` implies true), query (`?hardDelete=true`), or body; a `true` from ANY of those sources
  wins — a `false` sent elsewhere does NOT cancel a `true` sent through another channel.
  (`src/modules/orders/openapi.yaml:109`, `:114-118` `HardDeleteParam` in
  `shared/contracts/openapi.root.yaml:112-118`; `DeleteOrderRequest.hardDelete` default `false`
  at `src/modules/orders/openapi.yaml:463-465`)

## Shape / envelope

- **E20.** Every single-order response (`OrderEnvelope.data`) is a full `Order` object:
  `additionalProperties: false` with required `[id, userId, email, items, totalItems,
  totalQuantity, totalPrice, status]`. `actions` (`OrderActions`) is present on every response
  carrying ONE order (read, writes, cancel) but ABSENT from the list/search response items.
  (`shared/contracts/openapi.root.yaml:581-584`, `:633-638`;
  `src/modules/orders/openapi.yaml:335-347` `OrderEnvelope`)

- **E21.** `CreateOrderRequest` requires `userId`, `email`, `items` (`items` non-empty,
  `minItems: 1`); `additionalProperties: false` — no other fields accepted.
  (`src/modules/orders/openapi.yaml:401-415`)
