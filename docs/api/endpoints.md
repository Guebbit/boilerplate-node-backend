# Endpoints

Every HTTP route the application serves, in one place. The **Auth** column is the minimum access
level the mounted middleware actually enforces.

::: tip Where the detail is
This page is the whole-app index. Each domain's routes — with their full middleware chain, the
controller each lands on, and why the domain is shaped that way — live on its
[module page](../modules/). Both are generated from the same routers, so they cannot disagree.
:::

## Every route

<!-- gen:all-endpoints:start -->

| Module                                         | Method   | Path                                  | Auth  | What it does                                                |
| ---------------------------------------------- | -------- | ------------------------------------- | ----- | ----------------------------------------------------------- |
| [`account`](../modules/account.md)             | `DELETE` | `/account`                            | user  | Request account deletion                                    |
| [`account`](../modules/account.md)             | `GET`    | `/account`                            | user  | Current user info                                           |
| [`account`](../modules/account.md)             | `PUT`    | `/account`                            | user  | Update own profile                                          |
| [`account`](../modules/account.md)             | `GET`    | `/account/addresses`                  | user  | List saved addresses                                        |
| [`account`](../modules/account.md)             | `POST`   | `/account/addresses`                  | user  | Add an address                                              |
| [`account`](../modules/account.md)             | `DELETE` | `/account/addresses/{addressId}`      | user  | Remove an address                                           |
| [`account`](../modules/account.md)             | `PUT`    | `/account/addresses/{addressId}`      | user  | Update an address                                           |
| [`account`](../modules/account.md)             | `DELETE` | `/account/delete-confirm`             | none  | Confirm account deletion                                    |
| [`account`](../modules/account.md)             | `POST`   | `/account/login`                      | none  | Login                                                       |
| [`account`](../modules/account.md)             | `POST`   | `/account/logout`                     | none  | Logout this session                                         |
| [`account`](../modules/account.md)             | `POST`   | `/account/logout-all`                 | user  | Logout from all devices                                     |
| [`account`](../modules/account.md)             | `POST`   | `/account/password`                   | user  | Change password                                             |
| [`account`](../modules/account.md)             | `GET`    | `/account/refresh`                    | none  | Refresh access token                                        |
| [`account`](../modules/account.md)             | `POST`   | `/account/reset`                      | none  | Request password reset                                      |
| [`account`](../modules/account.md)             | `POST`   | `/account/reset-confirm`              | none  | Confirm password reset                                      |
| [`account`](../modules/account.md)             | `GET`    | `/account/sessions`                   | user  | List active sessions                                        |
| [`account`](../modules/account.md)             | `DELETE` | `/account/sessions/{sessionId}`       | user  | Revoke one session                                          |
| [`account`](../modules/account.md)             | `POST`   | `/account/signup`                     | none  | Signup                                                      |
| [`account`](../modules/account.md)             | `DELETE` | `/account/tokens/expired`             | admin | Remove expired tokens                                       |
| [`account`](../modules/account.md)             | `POST`   | `/account/verify-confirm`             | none  | Confirm email verification                                  |
| [`account`](../modules/account.md)             | `POST`   | `/account/verify-request`             | user  | Request email verification                                  |
| [`cart`](../modules/cart.md)                   | `DELETE` | `/cart`                               | user  | Empty cart or, if productId is set, remove target cart item |
| [`cart`](../modules/cart.md)                   | `GET`    | `/cart`                               | user  | Get cart                                                    |
| [`cart`](../modules/cart.md)                   | `POST`   | `/cart`                               | user  | Add/Edit cart item                                          |
| [`cart`](../modules/cart.md)                   | `DELETE` | `/cart/{productId}`                   | user  | Remove item from cart                                       |
| [`cart`](../modules/cart.md)                   | `PUT`    | `/cart/{productId}`                   | user  | Set cart item quantity                                      |
| [`cart`](../modules/cart.md)                   | `POST`   | `/cart/checkout`                      | user  | Checkout (place order from cart)                            |
| [`cart`](../modules/cart.md)                   | `POST`   | `/cart/reorder/{orderId}`             | user  | Reorder (refill cart from a past order)                     |
| [`cart`](../modules/cart.md)                   | `GET`    | `/cart/summary`                       | user  | Get cart summary                                            |
| [`delivery`](../modules/delivery.md)           | `POST`   | `/delivery/advance`                   | admin | Advance the fake courier                                    |
| [`delivery`](../modules/delivery.md)           | `GET`    | `/delivery/methods`                   | none  | List shipping methods                                       |
| [`delivery`](../modules/delivery.md)           | `GET`    | `/delivery/order/{orderId}`           | user  | Get the shipment behind an order                            |
| [`feedback`](../modules/feedback.md)           | `GET`    | `/feedback`                           | admin | List feedback requests                                      |
| [`feedback`](../modules/feedback.md)           | `PUT`    | `/feedback/{id}`                      | admin | Update feedback request status                              |
| [`feedback`](../modules/feedback.md)           | `POST`   | `/feedback/contact`                   | none  | Submit contact request                                      |
| [`feedback`](../modules/feedback.md)           | `POST`   | `/feedback/search`                    | admin | Search feedback requests (DTO-friendly)                     |
| [`inventory`](../modules/inventory.md)         | `POST`   | `/inventory/adjustments`              | admin | Adjust stock                                                |
| [`inventory`](../modules/inventory.md)         | `GET`    | `/inventory/levels`                   | admin | Stock levels                                                |
| [`inventory`](../modules/inventory.md)         | `GET`    | `/inventory/movements`                | admin | List stock movements                                        |
| [`inventory`](../modules/inventory.md)         | `POST`   | `/inventory/receipts`                 | admin | Receive stock                                               |
| [`inventory`](../modules/inventory.md)         | `POST`   | `/inventory/reservations/sweep`       | admin | Expire stale reservations                                   |
| [`locales`](../modules/locales.md)             | `GET`    | `/locales`                            | none  | Supported languages                                         |
| [`locales`](../modules/locales.md)             | `POST`   | `/locales`                            | admin | Add a language                                              |
| [`locales`](../modules/locales.md)             | `DELETE` | `/locales/{locale}`                   | admin | Remove a language                                           |
| [`locales`](../modules/locales.md)             | `GET`    | `/locales/{locale}`                   | none  | API message dictionary                                      |
| [`locales`](../modules/locales.md)             | `PUT`    | `/locales/{locale}`                   | admin | Edit a language                                             |
| [`locales`](../modules/locales.md)             | `GET`    | `/locales/{locale}/entries`           | admin | List translation entries                                    |
| [`locales`](../modules/locales.md)             | `PATCH`  | `/locales/{locale}/entries`           | admin | Merge entries                                               |
| [`locales`](../modules/locales.md)             | `POST`   | `/locales/{locale}/entries`           | admin | Add one translation entry                                   |
| [`locales`](../modules/locales.md)             | `PUT`    | `/locales/{locale}/entries`           | admin | Replace every entry                                         |
| [`locales`](../modules/locales.md)             | `DELETE` | `/locales/{locale}/entries/{entryId}` | admin | Remove one translation entry                                |
| [`locales`](../modules/locales.md)             | `PUT`    | `/locales/{locale}/entries/{entryId}` | admin | Edit one translation entry                                  |
| [`locales`](../modules/locales.md)             | `GET`    | `/locales/{locale}/messages`          | none  | Client message dictionary                                   |
| [`locales`](../modules/locales.md)             | `GET`    | `/locales/tenants`                    | none  | Translation tenants                                         |
| [`observability`](../modules/observability.md) | `GET`    | `/observability/audit`                | admin | Recent audit events                                         |
| [`observability`](../modules/observability.md) | `GET`    | `/observability/events`               | none  | Observability SSE stream                                    |
| [`observability`](../modules/observability.md) | `GET`    | `/observability/health`               | admin | Health snapshot                                             |
| [`observability`](../modules/observability.md) | `GET`    | `/observability/metrics`              | none  | Prometheus metrics                                          |
| [`observability`](../modules/observability.md) | `GET`    | `/observability/metrics/overview`     | admin | Metrics overview (JSON)                                     |
| [`orders`](../modules/orders.md)               | `DELETE` | `/orders`                             | admin | Delete order                                                |
| [`orders`](../modules/orders.md)               | `GET`    | `/orders`                             | user  | List orders (paginated)                                     |
| [`orders`](../modules/orders.md)               | `POST`   | `/orders`                             | admin | Create order                                                |
| [`orders`](../modules/orders.md)               | `PUT`    | `/orders`                             | admin | Update order                                                |
| [`orders`](../modules/orders.md)               | `DELETE` | `/orders/{id}`                        | admin | Delete order                                                |
| [`orders`](../modules/orders.md)               | `GET`    | `/orders/{id}`                        | user  | Order details                                               |
| [`orders`](../modules/orders.md)               | `PUT`    | `/orders/{id}`                        | admin | Edit order                                                  |
| [`orders`](../modules/orders.md)               | `POST`   | `/orders/{id}/cancel`                 | user  | Cancel order                                                |
| [`orders`](../modules/orders.md)               | `DELETE` | `/orders/{id}/hard`                   | admin | Permanently delete order                                    |
| [`orders`](../modules/orders.md)               | `GET`    | `/orders/{id}/invoice`                | user  | Download order invoice (PDF)                                |
| [`orders`](../modules/orders.md)               | `POST`   | `/orders/search`                      | user  | Search orders (DTO-friendly)                                |
| [`payments`](../modules/payments.md)           | `POST`   | `/payments/{id}/confirm`              | user  | Confirm a payment                                           |
| [`payments`](../modules/payments.md)           | `POST`   | `/payments/intent`                    | user  | Create a payment intent                                     |
| [`payments`](../modules/payments.md)           | `GET`    | `/payments/order/{orderId}`           | user  | Get the payment behind an order                             |
| [`payments`](../modules/payments.md)           | `POST`   | `/payments/order/{orderId}/refund`    | admin | Refund an order's payment                                   |
| [`products`](../modules/products.md)           | `DELETE` | `/products`                           | admin | Delete product                                              |
| [`products`](../modules/products.md)           | `GET`    | `/products`                           | none  | List products (paginated)                                   |
| [`products`](../modules/products.md)           | `POST`   | `/products`                           | admin | Create product                                              |
| [`products`](../modules/products.md)           | `PUT`    | `/products`                           | admin | Edit product                                                |
| [`products`](../modules/products.md)           | `DELETE` | `/products/{id}`                      | admin | Delete product                                              |
| [`products`](../modules/products.md)           | `GET`    | `/products/{id}`                      | none  | Product details                                             |
| [`products`](../modules/products.md)           | `PUT`    | `/products/{id}`                      | admin | Edit product                                                |
| [`products`](../modules/products.md)           | `DELETE` | `/products/{id}/hard`                 | admin | Permanently delete product                                  |
| [`products`](../modules/products.md)           | `GET`    | `/products/categories`                | none  | Catalogue facets                                            |
| [`products`](../modules/products.md)           | `POST`   | `/products/search`                    | none  | Search products (DTO-friendly)                              |
| [`users`](../modules/users.md)                 | `DELETE` | `/users`                              | admin | Delete user                                                 |
| [`users`](../modules/users.md)                 | `GET`    | `/users`                              | admin | List users (paginated)                                      |
| [`users`](../modules/users.md)                 | `POST`   | `/users`                              | admin | Create user                                                 |
| [`users`](../modules/users.md)                 | `PUT`    | `/users`                              | admin | Edit user                                                   |
| [`users`](../modules/users.md)                 | `DELETE` | `/users/{id}`                         | admin | Delete user                                                 |
| [`users`](../modules/users.md)                 | `GET`    | `/users/{id}`                         | admin | User details                                                |
| [`users`](../modules/users.md)                 | `PUT`    | `/users/{id}`                         | admin | Edit user                                                   |
| [`users`](../modules/users.md)                 | `DELETE` | `/users/{id}/hard`                    | admin | Permanently delete user                                     |
| [`users`](../modules/users.md)                 | `POST`   | `/users/search`                       | admin | Search users (DTO-friendly)                                 |
| [`wishlist`](../modules/wishlist.md)           | `GET`    | `/wishlist`                           | user  | Get wishlist                                                |
| [`wishlist`](../modules/wishlist.md)           | `POST`   | `/wishlist`                           | user  | Save a product                                              |
| [`wishlist`](../modules/wishlist.md)           | `DELETE` | `/wishlist/{productId}`               | user  | Remove a saved product                                      |
| [`wishlist`](../modules/wishlist.md)           | `POST`   | `/wishlist/{productId}/move-to-cart`  | user  | Move a saved product into the cart                          |

97 routes across 12 modules. The **Auth** column reads the mounted middleware chain rather than the contract, so it is what the server actually enforces. Each module page carries the same routes with their full middleware chain and controller.

<!-- gen:all-endpoints:end -->

## Notes by domain

The tables above are the complete list. What follows is the reasoning that does not fit in a table
row, per domain, with a link to the domain's own page.

## System (public)

A minimal root endpoint used to verify the process is alive.

## Observability

> Routes, middleware chains and controllers: [`observability`](../modules/observability.md#surface)

Endpoints for health checks, metrics, and audit logs. The two public routes feed external scrapers (Prometheus) and the live dashboard (SSE). The admin routes are intended for internal tooling. See the dedicated [Observability Endpoints](./observability.md) page for response shapes and tool links.

## Account & Auth

> Routes, middleware chains and controllers: [`account`](../modules/account.md#surface)

JWT-based authentication. Login returns an `accessToken` (short-lived) and a `refreshToken` (long-lived, stored in a cookie). The refresh endpoints issue a new access token without re-authenticating. Password reset is a two-step flow: request sends an email with a signed link, confirm validates it and updates the password. Email verification follows the same two-step shape — signup sends the first link automatically, and `verified` on the `User` is informational only (no endpoint refuses an unverified account).

`DELETE /account/tokens/expired` is the manual handle on a job that also runs on a schedule
(`services/token-cleanup.ts`); it is here so an operator can force the sweep without waiting.

## Products

> Routes, middleware chains and controllers: [`products`](../modules/products.md#surface)

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints (create, update, delete) are admin-only and invalidate the cache on change. Both single-item and bulk operations are supported.

Stock is read-only on this surface. `onHand`, `reserved` and `available` are serialized on every product, but the only body that accepts a counter is `POST /products` — a new product's opening `onHand`. The update bodies carry none: an absolute stock write on an edit form overwrites whatever sold while the form was open, so changing an existing product's stock is `POST /inventory/receipts` or `POST /inventory/adjustments`, both signed and both audited.

## Cart

> Routes, middleware chains and controllers: [`cart`](../modules/cart.md#surface)

Per-user, server-side cart. Items are scoped to the authenticated user. `POST /cart/checkout` converts the cart into an order, clears the cart, records the `cartCheckoutTotal` metric and emits a `CHECKOUT_COMPLETED` analytics event.

## Wishlist

> Routes, middleware chains and controllers: [`wishlist`](../modules/wishlist.md#surface)

Per-user saved products — ids only, joined client-side like the cart's lines. `POST /wishlist/:productId/move-to-cart` is the exit: the saved line becomes a cart line (quantity 1, incremented if already present) and leaves the wishlist.

## Orders

> Routes, middleware chains and controllers: [`orders`](../modules/orders.md#surface)

Orders are normally created via checkout but can also be created manually by an admin. Each order has a PDF invoice available for download. Read endpoints for regular users are scoped to their own orders only; admins can reach all orders through the write endpoints.

## Payments

> Routes, middleware chains and controllers: [`payments`](../modules/payments.md#surface)

An order's money, behind a provider port (`NODE_PAYMENT_PROVIDER`, default `fake` — magic test cards, no outside calls). The intent freezes the order's total; the confirm charges and moves the order `pending → paid` atomically; cancelling a paid order refunds automatically (the `ORDER_CANCELLED` event). The fake provider declines exactly `4000000000000002` and accepts everything else.

## Delivery

> Routes, middleware chains and controllers: [`delivery`](../modules/delivery.md#surface)

Shipping rates as pure domain rules (flat rates, free-above thresholds), priced authoritatively at checkout via `POST /cart/checkout`'s `shippingMethodId`. An order reaching `shipped` (admin status write) automatically gets a shipment, a tracking code and the shipped email; the fake courier is a button, not a schedule — this repo deliberately has no cron.

## Inventory

> Routes, middleware chains and controllers: [`inventory`](../modules/inventory.md#surface)

The only writer of stock in the application. A product carries two counters — `onHand` (units that exist) and `reserved` (units an open order has claimed) — and what a customer may buy is the difference, published as the derived `available`. Both counters live on the product document so a catalogue read needs no join; neither is written anywhere but here.

Six transitions move them, each a conditional write paired with the ledger row that explains it, so the ledger cannot have gaps:

| Transition | When                         | `onHand` | `reserved` |
| ---------- | ---------------------------- | -------- | ---------- |
| `reserve`  | checkout, admin order create | —        | `+q`       |
| `commit`   | payment confirmed            | `−q`     | `−q`       |
| `release`  | order cancelled              | —        | `−q`       |
| `expire`   | hold timed out (the sweep)   | —        | `−q`       |
| `receive`  | supplier delivery            | `+q`     | —          |
| `adjust`   | stocktake correction         | `±q`     | —          |

A checkout is **all-or-nothing** — the shop never silently ships fewer units than were ordered, because an order is what the customer agreed to buy. What it does do is say exactly what blocked it: a refusal carries `errors[0].details.lines`, one entry per short line with `productId`, `title`, `requested` and `available`, so a basket is fixed in one pass rather than one refusal per line. That holds on both refusal paths — the pre-flight, and the conditional reserve that decides a race, where the reported figure is read back at the moment the write refused.

Units therefore leave the shop only when they are paid for; an unpaid order costs availability for the length of its window (`NODE_RESERVATION_TTL_MINUTES`, default 30) and nothing more. The application ships no scheduler, so the sweep is driven from outside — a cron entry, the platform's scheduled job, or an operator — exactly as with the courier's `POST /delivery/advance`. Run it at least as often as the window, or holds outlive their deadline by the gap.

Both reads page and report `meta.totalItems`, and neither is bounded in the service. The ledger is the record an audit works through, so a read answering only the newest rows would misreport history as complete; the board sorts on availability, which is derived, so mongod projects it in an aggregation rather than the service loading every product to sort in memory. The low-stock threshold (`NODE_LOW_STOCK_THRESHOLD`) is shared by the board's `lowOnly` filter and the `products_low_stock_total` gauge, but the two count different populations on purpose: the board spans the whole catalogue, because an admin restocking needs to see an inactive product's units, while the gauge counts only publicly visible products, because an alert about stock nobody can buy is noise. Both measure AVAILABILITY rather than units on hand.

## Users (admin)

> Routes, middleware chains and controllers: [`users`](../modules/users.md#surface)

Full user management, admin-only. Supports individual and bulk operations. The equivalent self-service actions (profile read, account deletion) live under `/account`.

The three `/hard` routes are not extra operations in disguise. Each mounts the same handler as its
`:id` sibling behind `routeFlag('hardDelete')`, so the destructive variant has a URL of its own —
which is what makes it something a client asks for deliberately rather than a query string it can
set by accident.

## Locales

> Routes, middleware chains and controllers: [`locales`](../modules/locales.md#surface)

Language discovery and the API's own message dictionary. Public and uncached-by-token on purpose:
an unauthenticated client that has just failed to reach the API is exactly who needs the
dictionary, so requiring a token would make it unavailable in the one case it exists for. Both
responses are cached for an hour — the copy changes only on deploy.

## Feedback

> Routes, middleware chains and controllers: [`feedback`](../modules/feedback.md#surface)

Contact form submissions from anonymous or authenticated users. Admins can list all submissions and update their status (e.g. mark as resolved). Submitting a contact form also triggers a confirmation email via the mail worker.

## Realtime

Realtime is server → client only, via Server-Sent Events on `GET /observability/events` — an ordinary Express route, so all the usual middleware applies. Event names and payload shapes come from `asyncapi.yaml`; see [Observability Endpoints](./observability.md).

There is no WebSocket endpoint. SSE covers the push case without upgrade handling and works unchanged under clustering, since each stream is served entirely by the worker that accepted it. Adding bidirectional messaging means adding `ws` plus an `'upgrade'` listener on the HTTP server in `src/app.ts` — and, if connections need to talk to each other, a Redis/NATS backplane, because a connection is pinned to one worker.

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
