---
type: concept
audience: [developer, architect]
---

# Write Methods: POST

POST in depth: create, action, child writes, repeats, retries.

## POST

### Create → 201

- The body answered is the created resource itself ([Success Responses](../reference/responses.md)) — a checkout answers the order
  itself, an address write answers the address.
- `Location` names the new resource's URI (RFC 9110 §9.3.3) — `Location: /products/{id}`. The
  contract declares it `required` on every 201, and the shared response check
  (`tests/support/response-contract.ts`) fails a 201 without it.
- A retried create under its `Idempotency-Key` replays the `Location` with the body.
- A sub-collection create is a create too: `POST /delivery/fulfillment-orders/{id}/shipments`
  and the digital door `POST /delivery/fulfillment-orders/{id}/fulfill` answer 201 with `Location`
  naming the shipment, and `POST /payments/{id}/refunds` answers 201
  with the new `Refund` and `Location: /payments/{id}/refunds/{refundId}`. The payment's running
  totals are one `GET /payments/{id}` away.
- **A 201 means something was created** (RFC 9110 §15.3.2). An intent that only refreshes the
  order's one payment row answers **200**.
- Anything the contract does not declare is a 422 (`additionalProperties: false`), never a column.

### Action → 200

- `POST /orders/{id}/cancel`, `/restore`, `/override-status`: a state change on a
  thing that already exists. 200, with the thing as it now stands.
- When the body answered IS the new record, it is a create (201 + `Location`). When an action
  answers the thing acted on, it may create records on the side (refunds, credit notes, override
  shipments, stock movements) and stays 200.

#### A toggle is a pair of actions

A toggle on a resource is a state of a record that stays, flipped both ways (assigned or not, held
or not). When either direction has its own effect, guard, permission, audit row or notification, it
is a pair of POST actions, `POST /x/{id}/<verb>` and `POST /x/{id}/<opposite>`, never a PUT/DELETE
pair (Google [AIP-136](https://google.aip.dev/136): POST for a method with side effects):

- `assign` / `unassign` a task, `place-purchase-hold` / `lift-purchase-hold` on a user, `assign-role` /
  `revoke-role` on a user (the staff role; naming a different role replaces it, the last write wins).
- Each answers 200 and the resource. A repeat that finds the target state already reached is 409
  (`<RESOURCE>_ALREADY_<STATE>` or `<RESOURCE>_NOT_<STATE>`). No `Idempotency-Key`: the state
  machine refuses the repeat.
- A direction whose body names a value (assign to X, place a hold until D) treats "the same value
  already in force" as that repeat; its `actions` flag stays true, and the client hides the control
  for the value in force. A body-less direction's flag is false once its state is reached.
- PUT/DELETE sub-paths stay for what writes a value or names a thing: a line, a body-less pointer,
  a pending request its owner discards, a value of the parent (`…/shipping-address`,
  `/cart/shipping-method`, `…/cover`), the `/hard` delete.
- A toggle with no direction of its own is a field of PUT/PATCH (`Product.active`).

#### Action or field

A status or flag moves through an action when the move has its OWN effect, guard or permission.
Otherwise it is a field of `PUT` / `PATCH`.

| The move has...                                                                            | So it is                                                | Example                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| a side effect of its own (ends sessions, clears a cache, resets a streak, releases a hold) | an action                                               | `POST /users/{id}/deactivate`, `POST /orders/{id}/cancel`      |
| a guard or a permission of its own                                                         | an action                                               | `POST /locales/{locale}/deactivate` (fallback guard)           |
| an identity of its own: a sign-in or recovery channel, with a step-up and mails of its own | an action at its own door, never a field of the profile | `POST /account/email-change {email}`, `POST /account/password` |
| consequences that come only from the state it leaves behind                                | a field                                                 | `Product.active`, `purchasable`, `allowBackorder`              |

`product.buyable_again` does not make `active` an action: it follows the derived `buyable` state,
whichever of five fields or a stock receipt changed it. The same test is written from the domain
side in [`tactical-ddd.md`](tactical-ddd.md#action-endpoints-execute-update-does-not-decide).

### A line is written through its parent

A **line** is a part of a parent with no life of its own: a cart line, a saved product, a
back-in-stock request, an OAuth link, a task's note, a webhook subscription's secret. It is written through the
parent. It has no read of its own: where a line has a URL, that URL only adds, changes or removes
the line.

| Parent                               | Line collection                        | Add                                                      | Change                          | Remove                                                      |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| the cart                             | `/cart/items`                          | `POST /cart/items {productId, quantity}`                 | `PATCH /cart/items/{productId}` | `DELETE /cart/items/{productId}`, all: `DELETE /cart/items` |
| the wishlist                         | `/wishlist/items`                      | `POST /wishlist/items {productId}`                       | none (a line is a yes/no)       | `DELETE /wishlist/items/{productId}`                        |
| the stock-alert list                 | `/stock-alerts` itself                 | `POST /stock-alerts {productId}`                         | none                            | `DELETE /stock-alerts/{productId}`                          |
| the caller's OAuth links             | `/account/oauth/links`                 | `POST /account/oauth/links/{provider}` (a redirect flow) | none                            | `DELETE /account/oauth/links/{provider}`                    |
| a task's staff thread                | `/tasks/{id}/notes`                    | `POST /tasks/{id}/notes {body}`                          | none (append-only)              | none (append-only)                                          |
| a webhook subscription's secret ring | `/webhooks/subscriptions/{id}/secrets` | `POST …/secrets`                                         | none                            | `DELETE …/secrets/{secretId}`                               |

- The collection is `/items` when the parent holds one kind of line, the line's own noun when it
  has one (`/secrets`, `/links`), and the parent itself when it is nothing but the list.
- Every write answers **200 + the whole parent**: no 201, no `Location`, no GET of one line. A GET
  on the line collection is a 405 naming the writes; the parent's GET is the read.
- **A PUT never creates**, and a PATCH on a line the parent does not hold is a 404.
- A repeat is not an error for an add: adding what is saved is the same 200 and fires nothing
  twice. A cart add GROWS an existing line instead (Shopify, commercetools). Removing a line the
  parent does not hold is a 404. An append-only line (a note) has no identity to repeat on: each
  add appends one, and a retry is made safe by `Idempotency-Key` alone.
- Names: a line add is `create*` (`add*` for a cart line, which may grow instead), its removal
  `delete*` or `remove*`, its change `update*`.

Why: a 201 says a resource was created at a URL, and a line has no read of its own to name (RFC 9110
§9.3.3: a POST that creates SHOULD answer 201 with a `Location`, a SHOULD this API sets aside for a
line, with the reason here; §9.3.4 makes a PUT that creates a MUST-201). The parent is what the
client re-renders, so the parent is the answer (§15.3.1: a 200 carries "the result of the
action"). Medusa v2 (`POST`/`DELETE /store/carts/{id}/line-items[/{line_id}]`), BigCommerce
(`POST /carts/{id}/items`, `POST`/`DELETE /wishlists/{id}/items[/{item_id}]`), Shopify's
`cartLinesAdd`/`Update`/`Remove`, commercetools' cart update actions and Auth0's identity unlink
all answer the parent.

### A child created under its parent

A **child** with a life of its own (an id, a status, actions of its own) may be created at
`POST /parent/{id}/children` with no `GET` on that path (it answers 405 with `Allow: OPTIONS, POST`), when:

1. each child has its own `GET` by id;
2. all of a parent's children come back from one **named read**;
3. the POST's `description` names that read.

| Create                                             | Listed by                        | One child                               |
| -------------------------------------------------- | -------------------------------- | --------------------------------------- |
| `POST /payments/{id}/refunds`                      | `GET /payments/{id}` (`refunds`) | `GET /payments/{id}/refunds/{refundId}` |
| `POST /delivery/fulfillment-orders/{id}/shipments` | `GET /orders/{id}/shipments`     | `GET /delivery/shipments/{id}`          |

Why: Solidus (the reference for API shape) creates under the parent with no index, and Shopify's
current API reads children through the parent. AIP-121 says a resource "must support List"; a list
here is a small additive change the day a real caller asks for one. A **line** (above) differs: it
has no id or read of its own.

### Repeating an action (409)

An action whose target state is already reached is **refused**, not answered with a second success:
`409` with a `<RESOURCE>_ALREADY_<STATE>` code and a plain message. This is the lifecycle rule
(RFC 9110 §15.5.10: a conflict with the current state; Google's AIP-216 "state transition not
allowed", with 409 where Google says 400).

- `POST /users/{id}/activate` on an active account: `USER_ALREADY_ACTIVE`; `deactivate` on a
  deactivated one: `USER_ALREADY_INACTIVE`.
- `POST /tasks/{id}/resolve` on a resolved task: `TASK_ALREADY_RESOLVED`; `mark-spam` on spam:
  `TASK_ALREADY_SPAM`; `reopen` on an open one: `TASK_ALREADY_OPEN`. A reopen that finds a newer
  open task on the same situation: `TASK_SUPERSEDED`, with the newer task's id in `details`.
- `POST /users/{id}/lift-purchase-hold` on an account with no hold and no review flag:
  `USER_PURCHASE_HOLD_NOT_SET`.
- `POST /users/{id}/revoke-role` on an account with no staff role: `USER_ROLE_NOT_ASSIGNED`;
  `POST …/assign-role` naming the role it holds already: `USER_ROLE_ALREADY_ASSIGNED`. Both write and
  audit nothing.
- `POST /tasks/{id}/unassign` on a task nobody holds: `TASK_NOT_ASSIGNED`; `POST …/assign` to the
  person who holds it already: `TASK_ALREADY_ASSIGNED`. Both write, announce and audit nothing.
- A retried `DELETE` is never this refusal: what it answers with nothing left to remove is
  [DELETE — remove](./write-methods.md#delete-—-remove). The line rule's repeat 200 is for adds only: removing a line
  not held is a 404.
- The caller's `actions` flag for the move is `false` in that state, so a screen never offers it.
- Every 409 names a code, and the code is listed in a contract fragment's `x-error-codes`: a bare
  message cannot be told from its neighbour by a client. `tests/cross-cutting/api-standards.test.ts`
  reads the source for it.

#### An action whose target state is already reached

`POST …/enable` on an enabled subscription, `POST …/disable` on a disabled one: **409**, with
`<RESOURCE>_ALREADY_<STATE>` (`WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED`) and a plain message. Not
200, because an action may carry an effect a repeat must not re-run (enabling resets the failure
streak). Not 400, which Google's [AIP-216](https://google.aip.dev/216) uses: the lifecycle rule is
"a refusal that depends on the current state is 409 + code" (RFC 9110 §15.5.10). A `DELETE` is
not this refusal: see [DELETE — remove](./write-methods.md#delete-—-remove).

### An item write has an item read

A resource that can be changed by id can be read by id. Without `GET /x/{id}` a detail or edit page
has to find its record in a list: past the page size it never finds it, and it cannot tell "gone"
from "not loaded". The read is scoped like the list's rows (a row the caller may not see is a 404,
never a 403 that confirms it exists), and answers the same shape the list rows carry. Webhook
subscriptions are the example: `GET /webhooks/subscriptions/{id}`.

The item reads, and what each is scoped by:

| Item read                                            | Scoped by                                              |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `GET /webhooks/subscriptions/{id}`                   | the shop's own subscriptions                           |
| `GET /payments/{id}`                                 | the payer's own, or `display:Payment`                  |
| `GET /payments/{id}/refunds/{refundId}`              | the payment's scope; a record it does not hold         |
| `GET /tasks/{id}`                                    | `read:Task`, and for a system task its route set       |
| `GET /api-keys/{id}`                                 | this shop's credentials, `read:ApiKey`                 |
| `GET /account/addresses/{addressId}`                 | the caller's own book                                  |
| `GET /account/sessions/{sessionId}`                  | the caller's own live sessions                         |
| `GET /locales/{locale}/apps/{app}/entries/{entryId}` | `update:Locale`, the editing screen's key              |
| `GET /delivery/shipments/{id}`                       | the order's scope: the buyer's own, or `display:Order` |
| `GET /delivery/fulfillment-orders/{id}`              | the order's scope: the buyer's own, or `display:Order` |
| `GET /notifications/{id}`                            | the caller's own inbox                                 |
| `GET /webhooks/deliveries/{id}`                      | this shop's delivery log, `read:WebhookSubscription`   |
| `GET /inventory/levels/{productId}`                  | `read:StockLevel`, the stock board's key               |

A row the caller may not see, an unknown id and a malformed one are the same 404.

A successful write answers the resource exactly as a GET by the same caller reads it (AIP-133/134/164):
the same language, the same `translations` and stock counters for the same grants. `POST /products`,
`PUT` and `PATCH /products/{id}` and `POST /products/{id}/restore` are the example.

### Search → 200

`POST /x/search` is a read that needs a body — see
[Request Input](request-input.md). It creates nothing, so it is never a 201.

### Retrying a POST

A POST is not idempotent: sent twice, it may create twice. Every POST or PATCH whose repeat would
write again accepts an optional `Idempotency-Key`. Where a repeat would move money or stock twice (the do-not-retry class) the key is
required (400 without it), and a key whose first attempt never reported an outcome answers a stored
409 `IDEMPOTENCY_OUTCOME_UNKNOWN` instead of running again. See
[Do-not-retry operations](idempotency.md#do-not-retry-operations). A deliberate second click is a new intent with a new key, and acts
again. A PATCH whose merge patch sets absolute values is idempotent by construction and needs
none. Everything else is named, by class, in
[Named exceptions](idempotency.md#named-exceptions).

## Read next

- [write-methods](./write-methods.md): the hub this page belongs to.
