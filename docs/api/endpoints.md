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
| DELETE | `/account` | user | Delete own account |

## Products

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints (create, update, delete) are admin-only and invalidate the cache on change. Both single-item and bulk operations are supported.

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
| DELETE | `/products/:id` | admin | Delete single product |

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
| DELETE | `/orders/:id` | admin | Delete single order |

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

An append-only stock-movements ledger: every mover (checkout, cancel, the admin product form, the restock) announces through the `STOCK_MOVED` event and this module writes the row — the product's `stock` stays authoritative, the ledger explains. The low-stock gauge (`NODE_LOW_STOCK_THRESHOLD`) feeds the admin metrics overview.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/inventory/movements` | admin | The ledger, newest first (`?productId=` narrows) |
| POST | `/inventory/restock` | admin | Put units on a shelf, through the same announcement |

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
| DELETE | `/users/:id` | admin | Delete single user |

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
