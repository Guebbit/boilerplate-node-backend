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

Endpoints for health checks, metrics, and audit logs. None of these is public. The live dashboard's SSE stream needs `read:ObservabilitySnapshot` (by session cookie, since an `EventSource` cannot set a header), Prometheus scrapes `/observability/metrics` with a static token, and the rest need `read:ObservabilitySnapshot` and are intended for internal tooling. See the dedicated [Observability Endpoints](./observability.md) page for response shapes and tool links.

## Account & Auth

> The domain behind these routes: [`account`](../modules/account.md) · routes and middleware: `src/modules/account/routes.ts`

Two ways to stay signed in, picked per deployment (`GET /account/session-config` says which; [the two modes](../theory/sessions.md)). In `jwt` mode login returns a short-lived access `token` and sets a long-lived refresh cookie, and `POST /account/refresh` issues a new access token without re-authenticating. In `cookie` mode login sets one HttpOnly `__Host-session` cookie (or, for a client that asks for `transport: bearer`, returns a `sessionToken` to send as `Authorization: Bearer ses_…`), and there is nothing to refresh. Password reset is a two-step flow: request sends an email with a signed link, confirm validates it and updates the password. Email verification follows the same two-step shape — signup sends the first link automatically, and `verified` on the `User` is informational only (no endpoint refuses an unverified account).

Expired sessions and one-time tokens need no sweep: each row carries its own expiry date and the
database deletes it. The one nightly job here, `reap:previous-emails`
(`services/previous-email-cleanup.ts`), forgets the previous address of an account whose undo link
has lapsed. There is no endpoint for it: a manual run is `npm run reap:previous-emails`.

## Products

> The domain behind these routes: [`products`](../modules/products.md) · routes and middleware: `src/modules/products/routes.ts`

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints need `create:Product`, `update:Product` or `delete:Product` respectively, and invalidate the cache on change. Both single-item and bulk operations are supported.

Stock is read-only on this surface. `onHand`, `reserved` and `available` are serialized on every product, and no product body accepts a counter: an absolute stock write on a form overwrites whatever sold while it was open, so a product's stock, an opening count included, is `POST /inventory/receipts` or `POST /inventory/adjustments`, both signed and both audited.

## Cart

> The domain behind these routes: [`cart`](../modules/cart.md) · routes and middleware: `src/modules/cart/routes.ts`

Per-user, server-side cart. Items are scoped to the authenticated user. `POST /cart` is "add to cart": a new product gets a line (201), one already there grows (200). `PUT /cart/{productId}` sets a quantity. `POST /cart/checkout` converts the cart into an order, clears the cart, records the `cartCheckoutTotal` metric and emits a `checkout_completed` analytics event.

## Wishlist

> The domain behind these routes: [`wishlist`](../modules/wishlist.md) · routes and middleware: `src/modules/wishlist/routes.ts`

Per-user saved products — ids only, joined client-side like the cart's lines. `PUT /wishlist/:productId` saves one (idempotent, no body) and `DELETE` on the same URI removes it. `POST /wishlist/:productId/move-to-cart` is the exit: the saved line becomes a cart line (quantity 1, incremented if already present) and leaves the wishlist.

## Orders

> The domain behind these routes: [`orders`](../modules/orders.md) · routes and middleware: `src/modules/orders/routes.ts`

Orders are normally created via checkout but can also be created manually (a correction, not a sales channel — see [orders](../modules/orders.md#creating-an-order)). Each order has a PDF invoice available for download. Reads are scoped to the caller's own orders unless they hold a wider `orders.*` key, in which case the same route answers for the whole shop — one route, narrowed by the rules rather than branched on a role.

`orders` is the only writer of a `status` — `payments` and `delivery` each report a move through it rather than writing the field themselves. `POST /orders/{id}/status-override` and the `forced`/`reason` fields on delivery's own doors are the one exception: an `override:Order` holder correcting a status the ordinary rules refuse, always with a reason, always recorded (see [orders](../modules/orders.md#the-admin-override)).

## Payments

> The domain behind these routes: [`payments`](../modules/payments.md) · routes and middleware: `src/modules/payments/routes.ts`

An order's money, behind a provider port (`NODE_PAYMENT_PROVIDER`, no default: unset means no card payments, and the dev preload registers the `fake` [test double](../tools/test-doubles.md) — magic test cards, no outside calls). The intent freezes the order's total; the confirm charges and moves the order `pending → paid` atomically; cancelling a paid order refunds automatically, from the `refund` carried by the `order.cancelled` event `webhooks` also fans out on. The fake provider declines exactly the method reference `pm_card_declined` and accepts any other, bar two that stay in flight (`pm_card_authentication_required`, `pm_card_processing`).

## Delivery

> The domain behind these routes: [`delivery`](../modules/delivery.md) · routes and middleware: `src/modules/delivery/routes.ts`

Shipping rates as pure domain rules (flat rates, free-above thresholds), priced authoritatively at checkout via `POST /cart/checkout`'s `shippingMethodId`. There is no courier simulation: `POST /delivery/fulfillment-orders/{id}/shipments` and `POST /delivery/shipments/{id}/deliver` are staff recording a real handover and a real arrival, one shipment at a time, each door then reporting the move to `orders` in the same transaction — never the other way around. An order ships in as many shipments as it takes, and `GET /delivery/order/{orderId}` answers its fulfillment orders and shipments, each with its own `actions`. A tracked method's shipment call refuses with a named 422 unless it carries a `trackingCode`. What has not shipped is held (`…/hold`, `…/release`) or cancelled through [`returns`](../modules/returns.md#cancelling-what-has-not-shipped).

## Inventory

> The domain behind these routes: [`inventory`](../modules/inventory.md) · routes and middleware: `src/modules/inventory/routes.ts`

The only writer of stock in the application. A product's stock level carries two counters — `onHand` (units that exist) and `reserved` (units an open order has claimed) — and what a customer may buy is the difference, published as the derived `available`. Both counters live in this module's own `stocklevels` collection, the only place they are written; `products` keeps a read-only mirror of both on its own document so a catalogue read needs no join.

Seven transitions move them, each a conditional write paired with the ledger row that explains it, so the ledger cannot have gaps:

| Transition | When                         | `onHand` | `reserved` |
| ---------- | ---------------------------- | -------- | ---------- |
| `reserve`  | checkout, staff order create | —        | `+q`       |
| `commit`   | payment confirmed            | —        | —          |
| `ship`     | the units leave in a parcel  | `−q`     | `−q`       |
| `release`  | order cancelled              | —        | `−q`       |
| `expire`   | hold timed out (the sweep)   | —        | `−q`       |
| `receive`  | supplier delivery            | `+q`     | —          |
| `adjust`   | stocktake correction         | `±q`     | —          |

A checkout is **all-or-nothing** — the shop never silently ships fewer units than were ordered, because an order is what the customer agreed to buy. What it does do is say exactly what blocked it: a refusal carries `errors[0].details.lines`, one entry per short line with `productId`, `title`, `requested` and `availability` (sold out, short, off sale), never the number left, so a basket is fixed in one pass rather than one refusal per line. A staff order's refusal adds `available` for a caller who reads stock. That holds on both refusal paths — the pre-flight, and the conditional reserve that decides a race, where the reported figure is read back at the moment the write refused.

Paying moves no counter: the units stay on the shelf and spoken for until they ship, and leave the shop at dispatch. An unpaid order costs availability for the length of its window (`NODE_RESERVATION_TTL_MINUTES`, default 15) and nothing more. The application ships no scheduler, so the sweep is driven from outside — a cron entry, the platform's scheduled job, or an operator. Run it at least as often as the window, or holds outlive their deadline by the gap.

Both reads page and report `meta.totalItems`, and neither is bounded in the service. The ledger is the record an audit works through, so a read answering only the newest rows would misreport history as complete; the board sorts on availability, which is derived, so mongod projects it in an aggregation rather than the service loading every product to sort in memory. The low-stock threshold (`NODE_LOW_STOCK_THRESHOLD`) is shared by the board's `lowOnly` filter and the `products_low_stock_total` gauge, but the two count different populations on purpose: the board spans the whole catalogue, because somebody restocking needs to see an inactive product's units, while the gauge counts only publicly visible products, because an alert about stock nobody can buy is noise. Both measure AVAILABILITY rather than units on hand.

## Users (staff)

> The domain behind these routes: [`users`](../modules/users.md) · routes and middleware: `src/modules/users/routes.ts`

Full user management, behind `read:User` / `create:User` / `update:User` / `delete:User` per route. Supports individual and bulk operations. The equivalent self-service actions (profile read, account deletion) live under `/account`.

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

## Addresses

> The domain behind these routes: [`addresses`](../modules/addresses.md) · routes and middleware: `src/modules/addresses/routes.ts`

The caller's own address book, mounted under `/account/addresses`. Every response is `no-store`. `PUT /account/addresses/{addressId}/default` makes one entry the book's default — an action of its own, because the pointer belongs to the book, not to one address.

## Invoicing

> The domain behind these routes: [`invoicing`](../modules/invoicing.md) · routes and middleware: `src/modules/invoicing/routes.ts`

`GET /orders/{id}/invoice` and `GET /orders/{id}/credit-notes[/{creditNoteId}]`: the frozen PDF documents of an order, mounted under `/orders` but tagged `Invoicing`. The PDF routes are rate-limited because every render launches Chromium.

## Returns

> The domain behind these routes: [`returns`](../modules/returns.md) · routes and middleware: `src/modules/returns/routes.ts`

A customer asks to send goods back (`POST /returns`, idempotent by key); staff holding `update:Return` approve or decline, then mark the goods received. Received goods go back on sale and the refund runs through `payments`.

## Notifications

> The domain behind these routes: [`notifications`](../modules/notifications.md) · routes and middleware: `src/modules/notifications/routes.ts`

The caller's inbox: list, `read-all`, `dismiss-all`, delete one, and a per-user SSE stream at `GET /notifications/stream`. A frame reaches only the connections of the user it is about.

## Webhooks

> The domain behind these routes: [`webhooks`](../modules/webhooks.md) · routes and middleware: `src/modules/webhooks/routes.ts`

Subscription CRUD (`/webhooks/subscriptions`, including secret rotation), the delivery log (`GET /webhooks/deliveries`) and the event catalogue (`GET /webhooks/events`, served from `asyncapi.public.yaml`). Reachable by a session or an API key.

## API keys

> The domain behind these routes: [`api-keys`](../modules/api-keys.md) · routes and middleware: `src/modules/api-keys/routes.ts`

Mint, list and revoke machine credentials (`/api-keys`), each behind an `apikeys.any.*` key. Only a digest of the token is stored.

## Audit

> The domain behind these routes: [`audit-logs`](../modules/audit-logs.md) · routes and middleware: `src/modules/audit-logs/routes.ts`

One read, `GET /audit`, behind `read:AuditLog` — the queryable trail, kept for the window its TTL index enforces.

## Antibot

> The domain behind these routes: [`antibot`](../modules/antibot.md) · routes and middleware: `src/modules/antibot/routes.ts`

`GET /antibot/config` says which human-challenge provider is active; `GET /antibot/challenge` issues the work a self-hosted provider asks for.

## Analytics

> The domain behind these routes: [`analytics`](../modules/analytics.md) · routes and middleware: `src/modules/analytics/routes.ts`

`POST /analytics/events` takes one browsing event (`product_viewed`, `products_searched`) from a page whose visitor accepted analytics, and answers `204` whether or not it was recorded.

## Realtime

Realtime is server → client only, via Server-Sent Events on `GET /observability/events` (and the per-user `GET /notifications/stream`) — ordinary Express routes, so all the usual middleware applies. Event names and payload shapes come from `asyncapi.yaml`; see [Observability Endpoints](./observability.md).

There is no WebSocket endpoint. SSE covers the push case without upgrade handling and works unchanged under clustering, since each stream is served entirely by the worker that accepted it. Adding bidirectional messaging means adding `ws` plus an `'upgrade'` listener on the HTTP server in `src/app.ts` — and, if connections need to talk to each other, a Redis/NATS backplane, because a connection is pinned to one worker.

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
