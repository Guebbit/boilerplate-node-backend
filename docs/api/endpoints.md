# Endpoints

All available HTTP endpoints grouped by category. Auth column indicates the minimum access level required.

## System (public)

A minimal root endpoint used to verify the process is alive.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | none | Public ping — always 200 if process is running |

## Observability

Endpoints for health checks, metrics, and audit logs. The two public routes feed external scrapers (Prometheus) and the live dashboard (SSE). The admin routes are intended for internal tooling. See the dedicated [Observability Endpoints](./observability.md) page for response shapes and tool links.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/observability/events` | none | SSE stream: live metrics snapshot every 5 s |
| GET | `/observability/metrics` | none | Prometheus exposition format (text/plain) |
| GET | `/observability/health` | admin | Full health snapshot |
| GET | `/observability/metrics/overview` | admin | Curated KPI JSON |
| GET | `/observability/audit` | admin | Recent audit events |

## Account & Auth

JWT-based authentication. Login returns an `accessToken` (short-lived) and a `refreshToken` (long-lived, stored in a cookie). The refresh endpoints issue a new access token without re-authenticating. Password reset is a two-step flow: request sends an email with a signed link, confirm validates it and updates the password. Email verification follows the same two-step shape — signup sends the first link automatically, and `verified` on the `User` is informational only (no endpoint refuses an unverified account).

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/account/login` | none | Authenticate and get JWT |
| POST | `/account/signup` | none | Register a new user (sends verification email) |
| GET | `/account` | user | Get current user profile |
| PUT | `/account` | user | Update own profile (email change restarts verification) |
| POST | `/account/password` | user | Change password by proving the current one |
| GET | `/account/refresh` | none | Refresh access token (uses HttpOnly cookie) |
| POST | `/account/reset` | none | Request password reset email |
| POST | `/account/reset-confirm` | none | Confirm password reset |
| POST | `/account/logout` | none | Revoke THIS session's refresh token (cookie is the credential) |
| POST | `/account/logout-all` | user | Revoke all refresh tokens |
| GET | `/account/sessions` | user | List live refresh tokens as sessions |
| DELETE | `/account/sessions/:id` | user | Revoke one session ("log out that device") |
| GET | `/account/addresses` | user | List saved addresses (one is always default) |
| POST | `/account/addresses` | user | Add an address (first becomes default) |
| PUT | `/account/addresses/:id` | user | Update an address; `default: true` claims the slot |
| DELETE | `/account/addresses/:id` | user | Remove an address (default promotes a survivor) |
| POST | `/account/verify-request` | user | Re-send the email-verification link |
| POST | `/account/verify-confirm` | none | Spend the emailed token, mark the address verified |
| DELETE | `/account` | user | Request account deletion (sends the confirmation link) |
| DELETE | `/account/delete-confirm` | none | Spend the emailed token and delete the account |
| DELETE | `/account/tokens/expired` | admin | Sweep expired refresh tokens out of the database |

`DELETE /account/tokens/expired` is the manual handle on a job that also runs on a schedule
(`services/token-cleanup.ts`); it is here so an operator can force the sweep without waiting.

## Products

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints (create, update, delete) are admin-only and invalidate the cache on change. Both single-item and bulk operations are supported.

Stock is read-only on this surface. `onHand`, `reserved` and `available` are serialized on every product, but the only body that accepts a counter is `POST /products` — a new product's opening `onHand`. The update bodies carry none: an absolute stock write on an edit form overwrites whatever sold while the form was open, so changing an existing product's stock is `POST /inventory/receipts` or `POST /inventory/adjustments`, both signed and both audited.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/products` | none | List products (cached) |
| GET | `/products/categories` | none | Categories and tags with counts (filter chips, cached) |
| POST | `/products/search` | none | Search with filters |
| GET | `/products/:id` | none | Single product detail |
| POST | `/products` | admin | Create product |
| PUT | `/products` | admin | Bulk update products |
| PUT | `/products/:id` | admin | Update single product |
| DELETE | `/products` | admin | Bulk delete products |
| DELETE | `/products/:id` | admin | Delete single product (soft, unless `?hardDelete=true`) |
| DELETE | `/products/:id/hard` | admin | The same operation, with the flag spelled in the path |

## Cart

Per-user, server-side cart. Items are scoped to the authenticated user. `POST /cart/checkout` converts the cart into an order, clears the cart, records the `cartCheckoutTotal` metric and emits a `CHECKOUT_COMPLETED` analytics event.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/cart` | user | Get current cart |
| GET | `/cart/summary` | user | Cart summary (totals) |
| POST | `/cart` | user | Add item to cart |
| PUT | `/cart/:productId` | user | Update cart item quantity |
| DELETE | `/cart/:productId` | user | Remove item from cart |
| DELETE | `/cart` | user | Clear entire cart |
| POST | `/cart/checkout` | user | Checkout → create order |
| POST | `/cart/reorder/:orderId` | user | Refill cart from one of your own orders |

## Wishlist

Per-user saved products — ids only, joined client-side like the cart's lines. `POST /wishlist/:productId/move-to-cart` is the exit: the saved line becomes a cart line (quantity 1, incremented if already present) and leaves the wishlist.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/wishlist` | user | Get saved products |
| POST | `/wishlist` | user | Save a product (idempotent) |
| DELETE | `/wishlist/:productId` | user | Remove a saved product |
| POST | `/wishlist/:productId/move-to-cart` | user | Move a saved product into the cart |

## Orders

Orders are normally created via checkout but can also be created manually by an admin. Each order has a PDF invoice available for download. Read endpoints for regular users are scoped to their own orders only; admins can reach all orders through the write endpoints.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/orders` | user | List own orders (cached) |
| POST | `/orders/search` | user | Search own orders |
| GET | `/orders/:id` | user | Single order detail |
| GET | `/orders/:id/invoice` | user | Download order invoice PDF |
| POST | `/orders/:id/cancel` | user | Cancel own pending order (admin: anyone's) |
| POST | `/orders` | admin | Create order manually |
| PUT | `/orders` | admin | Bulk update orders |
| PUT | `/orders/:id` | admin | Update single order |
| DELETE | `/orders` | admin | Bulk delete orders |
| DELETE | `/orders/:id` | admin | Delete single order (soft, unless `?hardDelete=true`) |
| DELETE | `/orders/:id/hard` | admin | The same operation, with the flag spelled in the path |

## Payments

An order's money, behind a provider port (`NODE_PAYMENT_PROVIDER`, default `fake` — magic test cards, no outside calls). The intent freezes the order's total; the confirm charges and moves the order `pending → paid` atomically; cancelling a paid order refunds automatically (the `ORDER_CANCELLED` event). The fake provider declines exactly `4000000000000002` and accepts everything else.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/payments/intent` | user | Freeze one of your pending orders into a payment intent |
| GET | `/payments/order/:orderId` | user | The payment behind an order (admin: anyone's) |
| POST | `/payments/:id/confirm` | user | Confirm with a card; 409 `PAYMENT_DECLINED` is retryable |

## Delivery

Shipping rates as pure domain rules (flat rates, free-above thresholds), priced authoritatively at checkout via `POST /cart/checkout`'s `shippingMethodId`. An order reaching `shipped` (admin status write) automatically gets a shipment, a tracking code and the shipped email; the fake courier is a button, not a schedule — this repo deliberately has no cron.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/delivery/methods` | none | The shipping methods and their rates |
| GET | `/delivery/order/:orderId` | user | The shipment behind an order (tracking, delivered?) |
| POST | `/delivery/advance` | admin | The fake courier's tick: every shipped parcel arrives |

## Inventory

The only writer of stock in the application. A product carries two counters — `onHand` (units that exist) and `reserved` (units an open order has claimed) — and what a customer may buy is the difference, published as the derived `available`. Both counters live on the product document so a catalogue read needs no join; neither is written anywhere but here.

Six transitions move them, each a conditional write paired with the ledger row that explains it, so the ledger cannot have gaps:

| Transition | When | `onHand` | `reserved` |
| --- | --- | --- | --- |
| `reserve` | checkout, admin order create | — | `+q` |
| `commit` | payment confirmed | `−q` | `−q` |
| `release` | order cancelled | — | `−q` |
| `expire` | hold timed out (the sweep) | — | `−q` |
| `receive` | supplier delivery | `+q` | — |
| `adjust` | stocktake correction | `±q` | — |

A checkout is **all-or-nothing** — the shop never silently ships fewer units than were ordered, because an order is what the customer agreed to buy. What it does do is say exactly what blocked it: a refusal carries `errors[0].details.lines`, one entry per short line with `productId`, `title`, `requested` and `available`, so a basket is fixed in one pass rather than one refusal per line. That holds on both refusal paths — the pre-flight, and the conditional reserve that decides a race, where the reported figure is read back at the moment the write refused.

Units therefore leave the shop only when they are paid for; an unpaid order costs availability for the length of its window (`NODE_RESERVATION_TTL_MINUTES`, default 30) and nothing more. The application ships no scheduler, so the sweep is driven from outside — a cron entry, the platform's scheduled job, or an operator — exactly as with the courier's `POST /delivery/advance`. Run it at least as often as the window, or holds outlive their deadline by the gap.

Both reads page and report `meta.totalItems`, and neither is bounded in the service. The ledger is the record an audit works through, so a read answering only the newest rows would misreport history as complete; the board sorts on availability, which is derived, so mongod projects it in an aggregation rather than the service loading every product to sort in memory. The low-stock threshold (`NODE_LOW_STOCK_THRESHOLD`) is shared by the board's `lowOnly` filter and the `products_low_stock_total` gauge, but the two count different populations on purpose: the board spans the whole catalogue, because an admin restocking needs to see an inactive product's units, while the gauge counts only publicly visible products, because an alert about stock nobody can buy is noise. Both measure AVAILABILITY rather than units on hand.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/inventory/levels` | admin | The stock board — both counters and availability, scarcest first; paged (`?lowOnly=true` narrows) |
| GET | `/inventory/movements` | admin | The ledger, newest first — paged, with `meta.totalItems` (`?productId=`, `?reason=` narrow) |
| POST | `/inventory/receipts` | admin | A supplier delivery lands |
| POST | `/inventory/adjustments` | admin | A stocktake correction, signed; refuses to go below what is reserved |
| POST | `/inventory/reservations/sweep` | admin | Release timed-out holds and cancel the orders behind them |

## Users (admin)

Full user management, admin-only. Supports individual and bulk operations. The equivalent self-service actions (profile read, account deletion) live under `/account`.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users` | admin | List all users |
| POST | `/users/search` | admin | Search users |
| GET | `/users/:id` | admin | Single user detail |
| POST | `/users` | admin | Create user |
| PUT | `/users` | admin | Bulk update users |
| PUT | `/users/:id` | admin | Update single user |
| DELETE | `/users` | admin | Bulk delete users |
| DELETE | `/users/:id` | admin | Delete single user (soft, unless `?hardDelete=true`) |
| DELETE | `/users/:id/hard` | admin | The same operation, with the flag spelled in the path |

The three `/hard` routes are not extra operations in disguise. Each mounts the same handler as its
`:id` sibling behind `routeFlag('hardDelete')`, so the destructive variant has a URL of its own —
which is what makes it something a client asks for deliberately rather than a query string it can
set by accident.

## Locales

Language discovery and the API's own message dictionary. Public and uncached-by-token on purpose:
an unauthenticated client that has just failed to reach the API is exactly who needs the
dictionary, so requiring a token would make it unavailable in the one case it exists for. Both
responses are cached for an hour — the copy changes only on deploy.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/locales` | none | Which languages this deployment supports |
| GET | `/locales/:locale` | none | That locale's dictionary, the API's own keys only |

## Feedback

Contact form submissions from anonymous or authenticated users. Admins can list all submissions and update their status (e.g. mark as resolved). Submitting a contact form also triggers a confirmation email via the mail worker.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/feedback/contact` | none | Submit a contact form |
| GET | `/feedback` | admin | List all feedback (cached) |
| PUT | `/feedback/:id` | admin | Update feedback status |

## Realtime

Realtime is server → client only, via Server-Sent Events on `GET /observability/events` — an ordinary Express route, so all the usual middleware applies. Event names and payload shapes come from `asyncapi.yaml`; see [Observability Endpoints](./observability.md).

There is no WebSocket endpoint. SSE covers the push case without upgrade handling and works unchanged under clustering, since each stream is served entirely by the worker that accepted it. Adding bidirectional messaging means adding `ws` plus an `'upgrade'` listener on the HTTP server in `src/app.ts` — and, if connections need to talk to each other, a Redis/NATS backplane, because a connection is pinned to one worker.

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
