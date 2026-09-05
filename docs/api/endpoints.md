# Endpoints

Why the application's HTTP surface is shaped the way it is, domain by domain — the reasoning that
does not fit in a table row.

::: tip Looking for the exhaustive list?
The complete, authoritative list of routes is [`openapi.yaml`](./openapi-workflow.md) — every path,
its parameters, its bodies and its declared responses, and the document every client and every
generated type is built from. Open it in any viewer, or run `npm run contracts:bundle -- bruno`
for a collection you can send requests from.

What each route's middleware chain actually enforces is `src/modules/<name>/routes.ts`, one line
per endpoint. This page is the *why* around both.
:::


## System (public)

A minimal root endpoint used to verify the process is alive.

## Observability

> The domain behind these routes: [`observability`](../modules/observability.md) · routes and middleware: `src/modules/observability/routes.ts`

Endpoints for health checks, metrics, and audit logs. The two public routes feed external scrapers (Prometheus) and the live dashboard (SSE). The admin routes are intended for internal tooling. See the dedicated [Observability Endpoints](./observability.md) page for response shapes and tool links.

## Account & Auth

> The domain behind these routes: [`account`](../modules/account.md) · routes and middleware: `src/modules/account/routes.ts`

JWT-based authentication. Login returns an `accessToken` (short-lived) and a `refreshToken` (long-lived, stored in a cookie). The refresh endpoints issue a new access token without re-authenticating. Password reset is a two-step flow: request sends an email with a signed link, confirm validates it and updates the password. Email verification follows the same two-step shape — signup sends the first link automatically, and `verified` on the `User` is informational only (no endpoint refuses an unverified account).

`DELETE /account/tokens/expired` is the manual handle on a job that also runs on a schedule
(`services/token-cleanup.ts`); it is here so an operator can force the sweep without waiting.

## Products

> The domain behind these routes: [`products`](../modules/products.md) · routes and middleware: `src/modules/products/routes.ts`

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints (create, update, delete) are admin-only and invalidate the cache on change. Both single-item and bulk operations are supported.

Stock is read-only on this surface. `onHand`, `reserved` and `available` are serialized on every product, but the only body that accepts a counter is `POST /products` — a new product's opening `onHand`. The update bodies carry none: an absolute stock write on an edit form overwrites whatever sold while the form was open, so changing an existing product's stock is `POST /inventory/receipts` or `POST /inventory/adjustments`, both signed and both audited.

## Cart

> The domain behind these routes: [`cart`](../modules/cart.md) · routes and middleware: `src/modules/cart/routes.ts`

Per-user, server-side cart. Items are scoped to the authenticated user. `POST /cart/checkout` converts the cart into an order, clears the cart, records the `cartCheckoutTotal` metric and emits a `CHECKOUT_COMPLETED` analytics event.

## Wishlist

> The domain behind these routes: [`wishlist`](../modules/wishlist.md) · routes and middleware: `src/modules/wishlist/routes.ts`

Per-user saved products — ids only, joined client-side like the cart's lines. `POST /wishlist/:productId/move-to-cart` is the exit: the saved line becomes a cart line (quantity 1, incremented if already present) and leaves the wishlist.

## Orders

> The domain behind these routes: [`orders`](../modules/orders.md) · routes and middleware: `src/modules/orders/routes.ts`

Orders are normally created via checkout but can also be created manually by an admin. Each order has a PDF invoice available for download. Read endpoints for regular users are scoped to their own orders only; admins can reach all orders through the write endpoints.

## Payments

> The domain behind these routes: [`payments`](../modules/payments.md) · routes and middleware: `src/modules/payments/routes.ts`

An order's money, behind a provider port (`NODE_PAYMENT_PROVIDER`, default `fake` — magic test cards, no outside calls). The intent freezes the order's total; the confirm charges and moves the order `pending → paid` atomically; cancelling a paid order refunds automatically (the `ORDER_CANCELLED` event). The fake provider declines exactly `4000000000000002` and accepts everything else.

## Delivery

> The domain behind these routes: [`delivery`](../modules/delivery.md) · routes and middleware: `src/modules/delivery/routes.ts`

Shipping rates as pure domain rules (flat rates, free-above thresholds), priced authoritatively at checkout via `POST /cart/checkout`'s `shippingMethodId`. An order reaching `shipped` (admin status write) automatically gets a shipment, a tracking code and the shipped email; the fake courier is a button, not a schedule — this repo deliberately has no cron.

## Inventory

> The domain behind these routes: [`inventory`](../modules/inventory.md) · routes and middleware: `src/modules/inventory/routes.ts`

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

> The domain behind these routes: [`users`](../modules/users.md) · routes and middleware: `src/modules/users/routes.ts`

Full user management, admin-only. Supports individual and bulk operations. The equivalent self-service actions (profile read, account deletion) live under `/account`.

The three `/hard` routes are not extra operations in disguise. Each mounts the same handler as its
`:id` sibling behind `routeFlag('hardDelete')`, so the destructive variant has a URL of its own —
which is what makes it something a client asks for deliberately rather than a query string it can
set by accident.

## Locales

> The domain behind these routes: [`locales`](../modules/locales.md) · routes and middleware: `src/modules/locales/routes.ts`

Language discovery and the API's own message dictionary. Public and uncached-by-token on purpose:
an unauthenticated client that has just failed to reach the API is exactly who needs the
dictionary, so requiring a token would make it unavailable in the one case it exists for. Both
responses are cached for an hour — the copy changes only on deploy.

## Feedback

> The domain behind these routes: [`feedback`](../modules/feedback.md) · routes and middleware: `src/modules/feedback/routes.ts`

Contact form submissions from anonymous or authenticated users. Admins can list all submissions and update their status (e.g. mark as resolved). Submitting a contact form also triggers a confirmation email via the mail worker.

## Realtime

Realtime is server → client only, via Server-Sent Events on `GET /observability/events` — an ordinary Express route, so all the usual middleware applies. Event names and payload shapes come from `asyncapi.yaml`; see [Observability Endpoints](./observability.md).

There is no WebSocket endpoint. SSE covers the push case without upgrade handling and works unchanged under clustering, since each stream is served entirely by the worker that accepted it. Adding bidirectional messaging means adding `ws` plus an `'upgrade'` listener on the HTTP server in `src/app.ts` — and, if connections need to talk to each other, a Redis/NATS backplane, because a connection is pinned to one worker.

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
