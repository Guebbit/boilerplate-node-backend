# Write Methods: POST, PUT, PATCH

Every write route follows the web's own rules for its verb. This page is those rules, in the
form this API applies them, and the few places it deliberately does something else.

| | Standard |
| --- | --- |
| POST, PUT, status codes | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) — HTTP Semantics |
| PATCH | [RFC 5789](https://www.rfc-editor.org/rfc/rfc5789) — the method |
| What a PATCH body means | [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) — JSON Merge Patch |
| Retrying a POST safely | [`Idempotency-Key`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — IETF draft |

## The three verbs in one table

| | POST | PUT | PATCH |
| --- | --- | --- | --- |
| Means | create in a collection, or run an action | replace the whole resource | change part of it |
| Target | `/products` · `/orders/{id}/cancel` | `/products/{id}` | `/products/{id}` |
| Body | the new resource, or the action's input | the **full** new representation | only what changes |
| An omitted field | the server's default | **cleared** (see [PUT](#put-replace)) | left alone |
| `null` | 422 — nothing to clear yet | clears | clears |
| `''` | 422 wherever the field has `minLength: 1` | same | same |
| Safe to repeat | no — send `Idempotency-Key` | yes (idempotent) | yes, in practice |
| Success | **201** + the created resource + `Location` · **200** for an action | **200** + the resource | **200** + the resource |
| Target missing | — | 404 | 404 |

```mermaid
flowchart TD
    Q{"What does the call do?"}
    Q -->|"makes a new thing"| C["POST /collection<br/>201 + the new resource + Location"]
    Q -->|"runs a step: cancel, ship, restore"| A["POST /thing/{id}/verb<br/>200 + the thing after"]
    Q -->|"reads, with a big filter"| S["POST /collection/search<br/>200, never 201"]
    Q -->|"states the whole thing"| P["PUT /thing/{id}<br/>200"]
    Q -->|"changes some fields"| M["PATCH /thing/{id}<br/>200"]

    classDef post fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef put fill:#dbeafe,stroke:#2563eb,color:#111827;
    class C,A,S post;
    class P,M put;
```

## POST

### Create → 201

- The body answered is the created resource itself ([Success Responses](./responses.md)) — a checkout answers the order
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

- `POST /orders/{id}/cancel`, `/restore`, `/status-override`: a state change on a
  thing that already exists. 200, with the thing as it now stands.
- When the body answered IS the new record, it is a create (201 + `Location`). When an action
  answers the thing acted on, it may create records on the side (refunds, credit notes, override
  shipments, stock movements) and stays 200.

#### Action or field

A status or flag moves through an action when the move has its OWN effect, guard or permission.
Otherwise it is a field of `PUT` / `PATCH`.

| The move has... | So it is | Example |
| --- | --- | --- |
| a side effect of its own (ends sessions, clears a cache, resets a streak, releases a hold) | an action | `POST /users/{id}/deactivate`, `POST /orders/{id}/cancel` |
| a guard or a permission of its own | an action | `POST /locales/{locale}/deactivate` (fallback guard) |
| consequences that come only from the state it leaves behind | a field | `Product.active`, `purchasable`, `allowBackorder` |

`product.buyable_again` does not make `active` an action: it follows the derived `buyable` state,
whichever of five fields or a stock receipt changed it. The same test is written from the domain
side in [`tactical-ddd.md`](../theory/tactical-ddd.md#action-endpoints-execute-update-does-not-decide).

### A line is written through its parent

A **line** is a part of a per-user parent with no life of its own: a cart line, a saved product, a
back-in-stock request, an OAuth link, a webhook subscription's secret. It is written through the
parent, never on a URL of its own.

| Parent                    | Line collection         | Add                                  | Change                              | Remove                                            |
| ------------------------- | ----------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------------- |
| the cart                  | `/cart/items`           | `POST /cart/items {productId, quantity}` | `PATCH /cart/items/{productId}` | `DELETE /cart/items/{productId}`, all: `DELETE /cart/items` |
| the wishlist              | `/wishlist/items`       | `POST /wishlist/items {productId}`   | none (a line is a yes/no)           | `DELETE /wishlist/items/{productId}`              |
| the stock-alert list      | `/stock-alerts` itself  | `POST /stock-alerts {productId}`     | none                                | `DELETE /stock-alerts/{productId}`                |
| the caller's OAuth links  | `/account/oauth/links`  | `POST /account/oauth/links/{provider}` (a redirect flow) | none         | `DELETE /account/oauth/links/{provider}`          |

- The collection is `/items` when the parent holds one kind of line, the line's own noun when it
  has one (`/secrets`, `/links`), and the parent itself when it is nothing but the list.
- Every write answers **200 + the whole parent**: no 201, no `Location`, no GET of one line. A GET
  on the line collection is a 405 naming the writes; the parent's GET is the read.
- **A PUT never creates**, and a PATCH on a line the parent does not hold is a 404.
- A repeat is not an error: adding what is saved is the same 200 and fires nothing twice. A
  cart add GROWS an existing line instead (Shopify, commercetools).
- Names: a line add is `create*` (`add*` for a cart line, which may grow instead), its removal
  `delete*` or `remove*`, its change `update*`.

Why: a 201 says a resource was created at a URL, and a line has none (RFC 9110 §9.3.3 makes the
`Location` of a 201 a SHOULD; §9.3.4 makes a PUT that creates a MUST-201). The parent is what the
client re-renders, so the parent is the answer (§15.3.1: a 200 carries "the result of the
action"). Medusa v2 (`POST`/`DELETE /store/carts/{id}/line-items[/{line_id}]`), BigCommerce
(`POST /carts/{id}/items`, `POST`/`DELETE /wishlists/{id}/items[/{item_id}]`), Shopify's
`cartLinesAdd`/`Update`/`Remove`, commercetools' cart update actions and Auth0's identity unlink
all answer the parent.

### A child created under its parent

A **child** with a life of its own (an id, a status, actions of its own) may be created at
`POST /parent/{id}/children` with no `GET` on that path (it answers 405 with `Allow: POST`), when:

1. each child has its own `GET` by id;
2. all of a parent's children come back from one **named read**;
3. the POST's `description` names that read.

| Create                                                  | Listed by                         | One child                           |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------- |
| `POST /payments/{id}/refunds`                           | `GET /payments/{id}` (`refunds`)  | `GET /payments/{id}/refunds/{refundId}` |
| `POST /delivery/fulfillment-orders/{id}/shipments`      | `GET /orders/{id}/shipments`      | `GET /delivery/shipments/{id}`      |

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
- `DELETE /users/{id}/purchase-hold` on an account with no hold and no review flag:
  `USER_PURCHASE_HOLD_NOT_SET`.
- A retried `DELETE` leaves the same state (RFC 9110 §9.2.2). What is already gone answers 404, as
  Google's [AIP-135](https://google.aip.dev/135) does.
- The caller's `actions` flag for the move is `false` in that state, so a screen never offers it.
- Every 409 names a code, and the code is listed in a contract fragment's `x-error-codes`: a bare
  message cannot be told from its neighbour by a client. `tests/cross-cutting/api-standards.test.ts`
  reads the source for it.

#### An action whose target state is already reached

`POST …/enable` on an enabled subscription, `POST …/disable` on a disabled one: **409**, with
`<RESOURCE>_ALREADY_<STATE>` (`WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED`) and a plain message. Not
200, because an action may carry an effect a repeat must not re-run (enabling resets the failure
streak). Not 400, which Google's [AIP-216](https://google.aip.dev/216) uses: the lifecycle rule is
"a refusal that depends on the current state is 409 + code" (RFC 9110 §15.5.10). A `DELETE` stays
idempotent (RFC 9110 §9.2.2): deleting what is gone is not an action's refusal.

### An item write has an item read

A resource that can be changed by id can be read by id. Without `GET /x/{id}` a detail or edit page
has to find its record in a list: past the page size it never finds it, and it cannot tell "gone"
from "not loaded". The read is scoped like the list's rows (a row the caller may not see is a 404,
never a 403 that confirms it exists), and answers the same shape the list rows carry. Webhook
subscriptions are the example: `GET /webhooks/subscriptions/{id}`.

The item reads, and what each is scoped by:

| Item read                                              | Scoped by                                          |
| ------------------------------------------------------ | -------------------------------------------------- |
| `GET /webhooks/subscriptions/{id}`                     | the shop's own subscriptions                       |
| `GET /payments/{id}`                                   | the payer's own, or `display:Payment`              |
| `GET /payments/{id}/refunds/{refundId}`                | the payment's scope; a record it does not hold     |
| `GET /tasks/{id}`                                   | `read:Task`, and for a system task its route set |
| `GET /api-keys/{id}`                                   | this shop's credentials, `read:ApiKey`             |
| `GET /account/addresses/{addressId}`                   | the caller's own book                              |
| `GET /account/sessions/{sessionId}`                    | the caller's own live sessions                     |
| `GET /locales/{locale}/apps/{app}/entries/{entryId}`   | `update:Locale`, the editing screen's key          |
| `GET /delivery/shipments/{id}`                         | the order's scope: the buyer's own, or `display:Order` |
| `GET /delivery/fulfillment-orders/{id}`                | the order's scope: the buyer's own, or `display:Order` |
| `GET /notifications/{id}`                              | the caller's own inbox                             |
| `GET /webhooks/deliveries/{id}`                        | this shop's delivery log, `read:WebhookSubscription` |
| `GET /inventory/levels/{productId}`                    | `read:StockLevel`, the stock board's key           |

A row the caller may not see, an unknown id and a malformed one are the same 404.

### Search → 200

`POST /x/search` is a read that needs a body — see
[Request Input](../theory/request-input.md). It creates nothing, so it is never a 201.

### Retrying a POST

A POST is not idempotent: sent twice, it may create twice. Every POST that moves money, stock or
an account takes an `Idempotency-Key` — orders, checkout, payment moves, shipments, stock receipts
and adjustments. That is a minimum: signup takes one too. The POSTs that move none and are left
without are named, in four classes, in [Idempotency](../tools/idempotency.md#named-exceptions).

## PUT — replace

The body **is** the new resource (RFC 9110 §9.3.4).

| A field in the representation is… | Omitted from a PUT |
| --- | --- |
| clearable (`type` lists `'null'`) | cleared — as if it were sent as `null` |
| not clearable (no legal empty state) | **required**: omitting it is a 422 |
| outside the representation (below) | unchanged, always |

**Outside the representation** — a PUT neither sets nor clears these:

| Kind | Examples | Changed only by |
| --- | --- | --- |
| server-managed | `id`, timestamps, lifecycle `status`, totals, `verifiedAt` | the server |
| a secret with its own door | `password` | `POST /account/password`, the reset flow |
| an uploaded file | `imageUrl` | a multipart upload; an explicit `null` clears |
| a pointer owned by the parent | an address's `default` | `PUT /account/addresses/{id}/default` |

An image is the case that shapes the rule: a client can no longer send the current path back
(`imageUrl` accepts `null` only), so a PUT that never mentions it must keep it, or every
GET → edit → PUT round trip would delete the picture.

**Idempotent.** The same PUT twice leaves the same state as once (RFC 9110 §9.2.2). A value equal
to the stored one is no change — no second email, no role re-grant, no version or revision bump.
Logging each request is allowed.

**A PUT with no body points at something.** When the URI is the whole statement, the body is
empty: `PUT /account/addresses/{id}/default` (this address is the default). Sent twice, nothing
changes — Shopify's `PUT …/addresses/{id}/default.json` is the same shape. A line of a parent
(a saved product, a cart line) is not this: it is written through the parent, see
[A line is written through its parent](#a-line-is-written-through-its-parent).

**A PUT never creates.** A PUT on an id that does not exist is a 404 (a PUT that creates MUST
answer 201, RFC 9110 §9.3.4, and nothing here has a URL the client may name).

**Offer a PUT only when the body can be the whole resource.** A route that sets two fields of a
bigger record is a PATCH alone (`PATCH /users/{id}`), never a PUT that clears the rest.

**A server may transform.** RFC 9110 lets the stored state differ from the body. Here that is one
case: `PUT /account`'s `email` becomes `pendingEmail` until the new address is proven.

**A keyed map is part of the representation.** A product's `translations` on a PUT is the whole
set: a stored locale it leaves out is deleted, the fallback locale is required, and a locale it
states is stated whole (its omitted `description` is cleared).

## PATCH — JSON Merge Patch

The body is a merge patch (RFC 7396):

| The body says | The server does |
| --- | --- |
| `"field"` absent | leaves it alone |
| `"field": value` | replaces it |
| `"field": null` | clears it |
| `"list": [ … ]` | replaces the whole array |
| `"object": { … }` | merges into it by the same rules, one level down — `"translations": {"it": {"title": "x"}}` changes only the Italian title |

Sent as `application/merge-patch+json` (RFC 7396's own media type) or plain `application/json`
(what GitHub accepts). Both are declared in the contract on every PATCH; the frontend calls the
JSON one.

## Content-Type: 415

The JSON body parser handles only the types it is told to, so a body in any other type would arrive as
`{}` — and an all-optional PATCH schema accepts `{}`: a 200 that changed nothing. The guard refuses it instead.

```mermaid
flowchart LR
    R["write request<br/>with a body"] --> G{"type declared for<br/>this operation?"}
    G -->|"yes"| P["parse, validate, run"]
    G -->|"no"| E["415 — details.accepted lists the types"]
    N["no body at all"] --> P
```

The guard is `requireDeclaredContentType`, built from `api/request-content-types.ts`, which
`npm run gen:api` derives from the contract's own `requestBody` media types. A request with no
bytes is not judged: a missing required body is the schema's own 422.

Any write (`POST`, `PUT`, `PATCH`, `DELETE`) that declares no body is listed with no types at all
(`types: []`), and the guard refuses ANY body on it, `{}` included, `details.accepted` empty. An
action button (`POST /users/{id}/deactivate`) therefore never drops a `{"reason": …}` with a 200:
the sender is told the field was not read. The contract declares the 415 on every such operation.
For a `DELETE` that is also why `DELETE /products/{id}` takes no `{hardDelete}`
body: a client or gateway that drops it would turn a hard delete into a soft one, so the flag lives
in the query or the `/hard` path and a body is refused instead of ignored.

## A known path with the wrong method

A path the contract declares, asked with a method it does not give it, answers **405** with an
`Allow` header (RFC 9110 §15.5.6) — never the catch-all's 404. `DELETE /tasks/{id}` is fine,
`PATCH /tasks/{id}` is a 405 naming `DELETE, GET, HEAD`: a task's `status` is read-only and moves only through its doors.

- **`Allow` is sorted**, with HEAD beside GET. `OPTIONS` is never judged: the CORS layer answers
  a preflight before any route runs.
- **A trailing slash is the same path.** `/things/` reads as `/things`.
- **A literal path wins over a templated one.** `DELETE /products/facets` would otherwise
  read `categories` as the `{id}` of `/products/{id}` and answer 404, so the guard runs a second
  time before the routers, for paths with no `{param}` only.
- **A module this build does not serve stays a 404**: its paths are in the table, but nothing is
  mounted to ask.
- **Not declared per operation.** The 405 belongs to a request that matched no operation, so no
  operation's `responses` could carry it; its code, `METHOD_NOT_ALLOWED`, is in the contract's
  `x-error-codes`.

The guard is `methodNotAllowed`, built from `api/operation-routes.ts`, which `npm run gen:api`
derives from the contract's paths and mounted twice in `src/app/routes.ts`: before the routers
(literal paths) and right before the 404 (every other path).

## Empty, `null`, omitted

`null` is a **write verb**. It travels in a request, never in a response.

| | request (write) | response (read) |
| --- | --- | --- |
| key absent | nothing to say (POST: default · PATCH: untouched · PUT: cleared if clearable, else 422) | no value |
| `null` | clear it; PUT/PATCH only, only where `type` lists `'null'`; 422 on a create | **never sent** |
| `''` | an empty value, never "clear"; only where no `minLength` | only a real empty value (a blank translation), never "none" |

The read half is guarded twice: `tests/cross-cutting/contract-responses-never-null.test.ts` refuses
a `'null'` type in any response schema, and `tests/support/response-contract.ts` fails any real
response body that holds a `null` anywhere, free-form objects included (an audit row's `changes`, a
timeline row's `data`). An unset side of an audit `{ from, to }` is the absent key.

One exception: permission rule conditions on the session answers (a sign-in, `GET /account`, a
refresh). A permission rule's conditions are a query, not a value; `null` there is the operand "has no
value", and the only form allowed is `{ deletedAt: null }`. The client never evaluates a condition
(`can()` takes a type name only); the rule travels as the server holds it. Any other `null`, and any
other response carrying the same shape, is still refused.

The same spelling is the house query rule for a soft delete: `deletedAt: null`, never
`deletedAt: { $exists: false }`, so a permission rule and a repository filter read alike
(`products`' `PUBLIC_SCOPE` follows it). The rule is limited to `deletedAt` and permission
conditions: other fields legitimately ask `$exists` (`lockedUntil`, `supersededAt`, `trackingCode`).

A stored `null` that means something (a product's `backorderLimit`: no cap) is mapped in the
presenter, so the wire still says "absent". RFC 7396 §1 is why: a `GET` that served `"x": null`,
written back by a `PATCH`, would delete `x`.

Every optional free-text field in a write body carries `minLength: 1`, so a blank string is a
422 rather than a stored `''`. Search bodies are reads: an empty filter there is ignored.

A create body declares no `'null'` type — there is nothing to clear yet, so `null` is a 422 and
"no value" is spelt by leaving the field out.

## Multipart

`multipart/form-data` has no `null`: every part is a string or a file.

- The server validates a multipart body with the **JSON** schema of the same verb, after decoding
  booleans, numbers, arrays and JSON parts.
- So a clear cannot travel with an upload. Clear with a JSON PATCH; send the file alone, or with
  the fields that have values.
- The `*Multipart` schemas are documentation and client codegen only. They declare no
  `'null'` type.

## Status codes a write answers

| Code | When |
| --- | --- |
| 200 | an update, an action, a search, an idempotent refresh |
| 201 | a create — something new exists, and `Location` says where |
| 204 | a delete, a logout, a confirm step: done, nothing to say, no body — see [No content](./responses.md#no-content) |
| 404 | the target does not exist (or the caller may not know it does) |
| 409 | the write conflicts with the current state — a duplicate, a lifecycle refusal, an action whose target state is already reached, a cap reached (`WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`: deleting a record would let the same request through) |
| 412 | an `If-Match` that no longer matches — see [Conditional writes](#conditional-writes-etag-and-if-match) |
| 415 | a body in a type the operation does not declare |
| 422 | the body breaks the contract or a domain rule |

An action endpoint (`POST …/activate`) whose target state is already reached is refused, not
answered with a silent 200: **409** with `<RESOURCE>_ALREADY_<STATE>` and a plain message, as
Google AIP-216 asks for a state that cannot be moved to, kept at 409 because RFC 9110 §15.5.10
defines it as a conflict with the current state. `DELETE` stays idempotent (RFC 9110 §9.2.2).

The app-wide ones (400, 413, 415, 429, 500, 503) come from `x-app-level-responses` — see
[Regenerating](./regenerating.md).

## Conditional writes: ETag and If-Match

Two admins open the same product. Both save. Without a check, the second save silently overwrites
the first — the *lost update*. A versioned resource lets the client say "only if it is still the
version I read" (RFC 9110 §13.1.1); the server refuses with **412** when it is not.

| | Standard |
| --- | --- |
| `ETag`, `If-Match`, 412 | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) §8.8.3, §13.1.1, §15.5.13 |
| Same idea elsewhere | Kubernetes `resourceVersion`, Google [AIP-154](https://google.aip.dev/154) `etag` |

**Optional.** No `If-Match`, no check: the write runs as it always did, last writer wins. Requiring
it (428, RFC 6585) can come later without changing anything below.

```mermaid
sequenceDiagram
    participant A as Editor A
    participant B as Editor B
    participant S as API
    A->>S: GET /products/1
    S-->>A: 200 + ETag "4"
    B->>S: GET /products/1
    S-->>B: 200 + ETag "4"
    A->>S: PATCH /products/1<br/>If-Match: "4"
    S-->>A: 200 + ETag "5"
    B->>S: PATCH /products/1<br/>If-Match: "4"
    S-->>B: 412 PRECONDITION_FAILED — nothing written
    B->>S: GET /products/1 (re-read, reapply, resend)
```

### Which resources are versioned

A resource is versioned when its item read hands out an `ETag` **and** its write honours `If-Match`.
The contract says so with one marker on the path item — `x-versioned: [get, put, patch, delete]` —
and the bundler adds the header parameter, the 412 and the response header from it.

| Resource | Read that sends `ETag` | Writes that take `If-Match` |
| --- | --- | --- |
| product | `GET /products/{id}` | `PUT`, `PATCH`, `DELETE /products/{id}`, `DELETE /products/{id}/hard` |
| user | `GET /users/{id}` | `PUT`, `PATCH`, `DELETE /users/{id}`, `DELETE /users/{id}/hard` |
| order | `GET /orders/{id}` | `PUT`, `PATCH`, `DELETE /orders/{id}`, `DELETE /orders/{id}/hard` |
| the caller's account | `GET /account` | `PUT`, `PATCH /account` |
| example | `GET /examples/{id}` | `PUT`, `PATCH`, `DELETE /examples/{id}` |

Not versioned: a resource with no item read to take a tag from (tasks, locales, an address
inside its book), a resource that has an item read but no `If-Match` (webhook subscriptions) and
anything with its own concurrency rule (cart lines, stock). A `PUT` or `DELETE` with `If-Match` on one of those is simply not declared.

### What the tag is

- **`ETag: "<editRevision>"`** — strong, quoted, opaque to the client: compare it, never parse it.
  `editRevision` is an integer stored on the row (never in the representation) that every edit
  moves by one, in the same atomic update as the edit itself (`$inc`).
- **Why a counter, and not `updatedAt` or Mongoose's `__v`.** A strong validator must change
  whenever the representation does (RFC 9110 §8.8.1). Two edits in one millisecond share an
  `updatedAt` (and the PHP twin's timestamps have whole seconds); `__v` moves only when an *array*
  changes. A counter incremented by the database cannot repeat: two writers who both read 4 do not
  both write 5, even with no `If-Match` at all.
- **One rule says what moves it: the counter moves wherever `updatedAt` moves.** Mongoose's
  `timestamps` stamps `updatedAt` on every `save()` and query update that is an edit, and the
  plugin (`persistence/revision-plugin.ts`) adds the `$inc` beside that stamp — through `save()`,
  `updateOne`, `updateMany` and `findOneAndUpdate`, pipeline updates included. A write that is NOT
  an editor's edit passes `timestamps: false` and so never touches either: the stock mirror, the
  image digest, a session token. An admin's form is never invalidated by a customer logging in.
- **Where the counter lives.** It is the schema's Mongoose version key (`editRevision`, replacing
  `__v` on every versioned schema). It is not called `revision` because `locales` owns a wire
  field of that name with another meaning. It is stripped from every response and carried beside
  the shaped object (`carryVersion`) so a presenter can reshape a row without losing its tag.
- **An edit that changes nothing on the row still moves it, by stamping `updatedAt` by hand.**
  - A product edited only through its `translations` writes rows outside the product document
    (`TranslatableTarget.markEdited`, also for `PUT`/`PATCH /locales/translations/product/{id}`,
    whichever locale it names).
  - A user edited only through its `role` changes the membership, not the user document
    (`markModified('updatedAt')`): two admins on one tag cannot both change the role.
- **The orders anonymisation sweep is an edit.** It stamps `updatedAt`, so the counter moves and
  an edit form opened before it cannot put the scrubbed email back.
- **One private Mongoose touch.** `save()` has no public door for "increment, but add no version
  filter" (`Document#increment()` does both, which would turn every unconditional save into a
  failure when the row moved), so the plugin sets Mongoose's own `VERSION_INC` bit. A Mongoose
  upgrade that moves it fails `tests/integration/persistence/revision.test.ts` loudly.

### What the server does with `If-Match`

| Header | Result |
| --- | --- |
| absent | the write runs unconditionally |
| `"<tag>"` matching the stored version | the write runs; the response carries the **new** `ETag` |
| `"<tag>"` no longer matching, or the row is gone | **412** `PRECONDITION_FAILED`, nothing written |
| several tags, `"a", "b"` | matches if any does |
| `*` | matches any row that exists |
| weak (`W/"…"`), or anything that is not a quoted tag | never matches → 412 (`If-Match` compares strongly) |

- **The check and the write are one atomic step for `PUT`/`PATCH`/`DELETE`, hard or soft.** The version the
  service loaded is compared with the header, and the same version becomes part of the update's
  filter (Mongoose `$where`, on `editRevision`) — two editors holding the same tag cannot both win. A hard `DELETE`
  is fenced the same way: Mongoose 9 applies `$where` to a document delete, and a delete that
  removed nothing is a 412.
- **It lives in the repository, not in each module.** `createUpdateController` and
  `createDeleteController` open the precondition for the request; `repository.save` and
  `repository.deleteOne` meet it. A module's service never sees a header.
- **The body is validated first.** A 422 for a body the schema refuses wins over a 412.
- **The tag of a versioned read validates writes, not reads.** It covers the row's own edits, not
  what is derived from config (prices, the caller's language), so the contract does not offer a
  `304` from it.
- **The cached reads are a separate case.** Two families answer `If-None-Match` with `304` on no
  change, through Express's own ETag check: the `privateNoCache` reads (`orders`, `users`,
  `tasks`, `payments`, `returns`, `stats`: a private copy the browser revalidates) and every
  `setCache` read (`locales`, `products` `/facets` and `/:id`: the shared copy, revalidated once
  `max-age` runs out or at once under `browserRevalidate`). Each such `GET` carries
  `x-cache` in its fragment, and the bundler declares the answer (the shared `NotModified`: no
  body, an `ETag` header) on every operation that does, so no fragment repeats it.
  `tests/cross-cutting/cache-policy-declared.test.ts` walks the mounted routers and holds them
  equal to the `x-cache` operations, both ways.
  The sitemap streams its XML and carries no `ETag`, so it is not one of them.
- **Browsers** may send `If-Match` and read `ETag` cross-origin: both are in the CORS allow and
  expose lists.

### For a client

1. Keep the `ETag` of the record the form loaded.
2. Send it back as `If-Match` on the save; take the new `ETag` from the 200.
3. On 412 the record changed under you: re-read it, show the user what is different, resend.

## Deliberate exceptions

| Route | Differs how | Why |
| --- | --- | --- |
| `PUT /account` | `email` is stored as `pendingEmail` | an address is proven before it replaces the old one |
| `POST /account/signup` | a refused address still gets a 201 and the same `Location: /account`, and nothing is created | antibot: the refusal must look like a success |
| `PUT /cart/shipping-method`, `PUT /locales/{locale}/apps/{app}/entries/{entryId}`, `PUT /account/addresses/{id}/default` | no PATCH | one field, or none; a PATCH would say exactly what the PUT says |
| `POST /payments`, `POST /orders/{id}/payments` | 200 when they refresh or convert the order's one payment row | one payment per order is a database fact |
| `PUT`/`PATCH /locales/{locale}/apps/{app}/entries` | the app is a path segment; the body is `{ entries: { <key>: text } }`, and under PATCH a `null` deletes its key | a PUT replaces exactly what the GET on the same URI lists; the map is a real merge patch (RFC 7396) |

## How it is kept true

| Guard | Catches |
| --- | --- |
| `createUpdateController` — [Request Flow](../theory/request-flow.md#put-replaces-patch-merges) | one PUT/PATCH pipeline for every factory-backed resource |
| `tests/cross-cutting/replace-patch-parity.test.ts` | a PUT and a PATCH schema declaring different fields |
| `tests/support/response-contract.ts` | a 201 without its `Location`, a status the operation does not document |
| `tests/contract/write-methods.test.ts` | an empty string stored, an undeclared type accepted, a `Location` missing or wrong, a 412 the contract does not declare, an `ETag` a versioned 200 forgot |
| `tests/integration/conditional-writes.test.ts` | a stale `If-Match` that still wrote, two editors on one tag both winning, a translations-only or role-only edit that left the tag alone, a non-edit write that moved it |
| `tests/integration/persistence/revision.test.ts` | a counter that repeats under two writers, moves for a non-edit, or misses a form of write (`save`, `updateOne`, `updateMany`, `findOneAndUpdate`, a pipeline) |
| `tests/unit/scripts/contracts/openapi-bundle.test.ts` | an `x-versioned` marker that did not reach the bundled operation |
| `tests/contract/request-contract.test.ts` | a body the contract refuses being accepted |
| `tests/fuzz/endpoints.fuzz.test.ts` | a hostile body answered with a 5xx |
