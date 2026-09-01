# BE-6 — Frozen expectations (blind, from Tier A spec only)

Source: `security:` blocks and per-operation descriptions in `src/modules/*/openapi.yaml`
(all 12 module contract fragments were grepped/read). No file under `src/` outside these
`openapi.yaml` fragments, and no test file, was opened before this file was committed.

Convention used below: "own-scoped" = a non-admin caller only sees/affects resources tied to
their own user id; the spec's consistent tell for this is that the operation's `responses` map
has **no `403`** — a stranger's resource is hidden as `404`, not refused as `403`. An explicit
admin-only operation instead documents "admin"/"administrators"/"Requires admin role" and its
`responses` map **does** include `403`.

## Account (`src/modules/account/openapi.yaml`)

- E1: `PUT /account` (updateAccount) acts only on the authenticated caller's own profile.
  Cites: account/openapi.yaml:26-27 ("Updates the authenticated user's own profile").
- E2: `GET /account/sessions` (getSessions) lists only the caller's own live sessions.
  Cites: account/openapi.yaml:102 ("the authenticated user's live refresh tokens").
- E3: `DELETE /account/sessions/{sessionId}` (revokeSession) only revokes a session belonging to
  the caller; a well-formed id naming someone else's session is documented as a miss.
  Cites: account/openapi.yaml:120, 134 ("matches none of the caller's live sessions").
- E4: `GET /account/addresses`, `POST /account/addresses`, `PUT /account/addresses/{addressId}`,
  `DELETE /account/addresses/{addressId}` all operate only on the caller's own address book; an
  `addressId` naming another caller's address is documented as not found ("someone else's").
  Cites: account/openapi.yaml:143,159,184,209("someone else's"),217.
- E5: `DELETE /account/tokens/expired` (deleteExpiredTokens) is admin-only ("Restricted to
  administrators") and is the only account-module operation with a `403 Forbidden` response.
  Cites: account/openapi.yaml:413(description),415-420(security+403).
- E6: Every other account operation (login, signup, refresh, logout, logout-all, password
  change/reset, verify, delete-confirm) has no admin/scoping statement and no `403` — they act
  only on the caller identified by the credential presented (bearer token, refresh cookie, or a
  one-time token in the body), never on another named user.
  Cites: account/openapi.yaml:14-415 (full security-block survey; no other operation lists `403`).

## Cart (`src/modules/cart/openapi.yaml`)

- E7: Every cart operation (`GET/POST/DELETE /cart`, `DELETE /cart/all`,
  `PUT/DELETE /cart/{productId}`, `GET /cart/summary`, `POST /cart/checkout`) acts only on "the
  authenticated user's cart" — no admin override, no `403` anywhere in the file.
  Cites: cart/openapi.yaml:11,27,52,81,100,127,151("authenticated user's current cart") — grep
  for `403` over the whole file returns nothing.
- E8: `POST /cart/reorder/{orderId}` (reorder) reads only one of the caller's own orders, and
  admins are NOT exempt from this — the spec explicitly says admins are scoped to their own
  orders too for this operation, unlike the general order-listing rule (E13/E17).
  Cites: cart/openapi.yaml:200 ("Admins are scoped to their own orders too — the cart being
  filled is the caller's."), 219 ("matches none of the caller's own orders").

## Delivery (`src/modules/delivery/openapi.yaml`)

- E9: `GET /delivery/order/{orderId}` (getShipmentByOrder) is scoped to "one of the caller's
  orders", explicitly "read through the same scope every order read uses" (i.e. same rule as
  orders module) and has no `403` response.
  Cites: delivery/openapi.yaml:27,37.
- E10: `POST /delivery/advance` (advanceCourier) is admin-only ("Admin, and deliberately a
  button...") and is the only delivery operation with a `403`.
  Cites: delivery/openapi.yaml:54("Admin"),56-66(security+403).

## Feedback (`src/modules/feedback/openapi.yaml`)

- E11: `GET /feedback`, `POST /feedback/search`, `PUT /feedback/{id}`, `DELETE /feedback/{id}`
  are all for "admin review" and all four carry `403 Forbidden`. Only `POST /feedback/contact`
  (public submission, `security: []`) is not admin-gated.
  Cites: feedback/openapi.yaml:11(security:[]),34("admin review"),65,92,120,136(403 responses).

## Inventory (`src/modules/inventory/openapi.yaml`)

- E12: Every inventory operation (`GET /inventory/levels`, `GET /inventory/movements`,
  `POST /inventory/receipts`, `POST /inventory/adjustments`,
  `POST /inventory/reservations/sweep`) is admin-only ("Admin; a customer sees `available` on
  the product itself" / "A job behind an admin endpoint") and every one carries `403`.
  Cites: inventory/openapi.yaml:11("Admin"),33,67,93,120,138("admin endpoint"),150.

## Orders (`src/modules/orders/openapi.yaml`)

- E13: `GET /orders` (listOrders) and `POST /orders/search` (searchOrders, alias of listOrders):
  non-admin callers are automatically scoped to their own orders; the `userId` filter is
  IGNORED for non-admin callers (not rejected — silently scoped).
  Cites: orders/openapi.yaml:12-13, 139-140 (identical wording on both operations).
- E14: `GET /orders`/`POST /orders/search` have no `403` in their responses (401/422/500 only) —
  scoping is enforced by silently narrowing the result set, not by refusing the request.
  Cites: orders/openapi.yaml:38-41(listOrders responses), 157-161(searchOrders responses).
- E15: `GET/PUT/DELETE /orders/{id}` (getOrderById, updateOrderById, deleteOrderById) DO carry a
  `403 Forbidden` response (unlike the list/search operations), but no operation description
  states the ownership rule directly for these three — E15 records the spec is silent on
  whether 403 or 404 is used for a non-owner's single-order id here, only that 403 is a
  documented possible outcome.
  Cites: orders/openapi.yaml:181,209,231 (403 present); 168,188,226 (no ownership wording in
  description).
- E16: `POST /orders` (createOrder) and `PUT/DELETE /orders` (updateOrder/deleteOrder, body-id
  aliases) and `DELETE /orders/{id}/hard` (hardDeleteOrderById) all carry `403` too, with no
  per-operation ownership wording — same as E15.
  Cites: orders/openapi.yaml:68(createOrder no 403 actually — verify below), 104,131(403).
  NOTE: createOrder (line 45-69) responses do NOT list 403 (401/422/500 only) — corrected: only
  updateOrder/deleteOrder/updateOrderById/deleteOrderById/hardDeleteOrderById carry 403, not
  createOrder or listOrders/searchOrders.
- E17: `POST /orders/{id}/cancel` (cancelOrderById): "a non-admin can cancel only their own
  orders; an admin can cancel anyone's." This operation has NO `403` in its responses
  (401/404/409/422/500 only) — a non-owner's order is hidden as 404, not refused as 403.
  Cites: orders/openapi.yaml:279-281("non-admin can cancel only their own orders; an admin can
  cancel anyone's"), 297-307(responses, no 403).
- E18: `GET /orders/{id}/invoice` (getOrderInvoice) has no explicit ownership sentence but, like
  cancel, has NO `403` in its responses (401/404/422/500 only) — consistent with the file-wide
  pattern that ownership-scoped single-resource reads answer 404 for someone else's order.
  Cites: orders/openapi.yaml:312-326.

## Payments (`src/modules/payments/openapi.yaml`)

- E19: `POST /payments/intent` (createPaymentIntent) acts only on "one of the caller's `pending`
  orders"; no `403` in responses (401/404/409/422/500).
  Cites: payments/openapi.yaml:11,26-31.
- E20: `GET /payments/order/{orderId}` (getPaymentByOrder): scoped to "one of the caller's
  orders. Admins read anyone's." No `403` in responses (401/404/422/500) — non-owner is a 404.
  Cites: payments/openapi.yaml:40("Admins read anyone's"),44,54-57.
- E21: `POST /payments/order/{orderId}/refund` (refundPaymentByOrder) is "Admin only" and is the
  only payments operation with `403`.
  Cites: payments/openapi.yaml:70("Admin only."),85(403).
- E22: `POST /payments/{id}/confirm` (confirmPayment): description gives no explicit ownership
  statement in the grepped section; treat as SPEC-SILENT on scoping for this operation
  specifically (do not assume own-order scoping for it beyond what createPaymentIntent implies).

## Products (`src/modules/products/openapi.yaml`)

- E23: `POST/PUT/DELETE /products` and `PUT/DELETE /products/{id}` and
  `DELETE /products/{id}/hard` (all mutating product operations) carry `403 Forbidden` — write
  access is staff/admin-gated. `GET /products`, `GET /products/{id}`, `GET /products/categories`
  (reads) carry no `403` and `GET /products/categories` is `security: []` (public).
  Cites: products/openapi.yaml:67-88,95-116(403 on writes),151(security:[] on categories).

## Users (`src/modules/users/openapi.yaml`)

- E24: The entire `/users` resource (list/create/update/delete, by-id and body-id forms, plus
  `/users/search`) is admin-only: a schema comment states the listing "answers 403 to anyone who
  is not staff before a filter is read at all", and every operation in the file carries `403`.
  Cites: users/openapi.yaml:300-302 ("ALREADY admin-only listing... answers 403 to anyone who is
  not staff"), plus 403 responses at lines 49,76,104,129,153,183,207,228,257.
- E25: The `admin` query/body field on `/users` (list filter and create/update body field) is a
  user-record property (whether that target user has the admin role), NOT an authorization
  scope declaration — do not conflate occurrences of the word "admin" in the `User`/
  `CreateUserRequest` schemas with a caller-scoping rule.
  Cites: users/openapi.yaml:32-34(list filter),326-329(create body field).

## Wishlist (`src/modules/wishlist/openapi.yaml`)

- E26: Every wishlist operation (`GET/POST /wishlist`, `DELETE /wishlist/{productId}`,
  `POST /wishlist/{productId}/move-to-cart`) acts only on "the authenticated user's wishlist" —
  no admin override, no `403` anywhere in the file.
  Cites: wishlist/openapi.yaml:11,27,54,76 — grep for `403` over the whole file returns nothing.

## Locales, Observability, Delivery-methods, Feedback-contact (public/admin split, for context)

- E27: `GET /delivery/methods` and `GET /products/categories` and `POST /feedback/contact` and
  `POST /account/verify-confirm`/`delete-confirm`/`login`/`signup`/`reset`/`reset-confirm` are
  `security: []` — genuinely unauthenticated, not "any caller, scoped to self".
  Cites: delivery/openapi.yaml:13; products/openapi.yaml:151; feedback/openapi.yaml:13;
  account/openapi.yaml:261,279,297,321,349,367,385.
- E28: Observability module (`GET /observability/health`, `/metrics/overview`, `/audit`) is
  documented "Requires admin role" per operation and all carry `403`; `/observability/events`
  is guarded differently (comment: "Guarded by `isAdminViaCookie`" — cookie-based, since an
  EventSource cannot set an Authorization header) and `/observability/metrics` is guarded by a
  separate static scraper token (`isMetricsScraper`), not the admin JWT at all. This module is
  out of BE-6's test scope (no service-scope.test.ts there) but is recorded for completeness
  since "admin role" is centrally enforced differently per sub-endpoint here.
  Cites: observability/openapi.yaml:23-24,43-49,75-76,95-96,116-121.

## Summary rule extracted for this batch

- **Admin-only operations** (E5,E10,E11,E12,E21,E23,E24,E28): spec says "admin"/"administrator"/
  "staff"/"Requires admin role" in the description, and the operation's `responses` map lists
  `403`.
- **Own-scoped operations for everyone incl. admins** (E8 reorder): explicit "admins are scoped
  to their own X too" language.
- **Own-scoped operations, admin sees all** (E13/E17/E19/E20, orders/payments/cart-reorder
  family): non-admin sees/affects only their own resource; an admin bypasses the scope. The
  observed spec convention: when the bypass is by silently narrowing a list/search filter, no
  `403` appears (E14); when the scope is per-resource ownership, a stranger's id is hidden as
  404 (E17, E18, E20), not refused as 403 — EXCEPT `GET/PUT/DELETE /orders/{id}` and
  `POST/PUT/DELETE /orders` and `/orders/{id}/hard`, which DO carry 403 despite no explicit
  per-operation ownership sentence (E15/E16) — this is the one place in the surveyed spec where
  the 404-vs-403 convention is not confirmed by an explicit description sentence, so treat any
  test asserting 403-for-non-owner vs 404-for-non-owner on those specific operations as
  consistent with a documented response code but NOT as confirming which HTTP status the
  ownership check itself is supposed to produce — the spec is ambiguous there, not the tests.
