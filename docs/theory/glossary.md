# Glossary

The terms each module uses, **defined as that module means them**.

This is deliberately not one flat list. The same word legitimately means different things in two
modules, and that divergence is the whole point of a bounded context — `Soft delete` is a
withdrawal from sale in `products` and a destroyed account in `users`, and a single entry would
have to be wrong in one of those places.

::: tip Where the language actually lives
In the code. `Reserved`, `Available`, `softDelete`, `OrderStatus` — the identifiers **are** the
ubiquitous language, and they are what a change has to move. This page carries the part an
identifier cannot: what the term means, and the constraint behind it.
:::

See [Strategic DDD](./strategic-ddd.md#_3-ubiquitous-language-per-context-not-per-app) for why the
language is kept per context rather than shared.

---

## `account`

| Term                 | What it means here                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **Session**          | Proof of who is asking, carried in cookies. An access token to spend and a refresh token to renew it. |
| **Access token**     | Short-lived bearer of identity. Never stored — if it is valid it is trusted.                          |
| **Refresh token**    | Long-lived, revocable, stored on the User record. Losing it is what logging out means.                |
| **Address**          | An entry in the account’s address book. The one collection this module owns outright.                 |
| **Account deletion** | Two steps — a request that issues a token, and a confirm that destroys the record. Never one call.    |

## `audit-logs`

| Term            | What it means here                                                            |
| --------------- | ----------------------------------------------------------------------------- |
| **Audit entry** | One record of an action: the actor, the action, the target, the time.         |
| **Actor**       | Who did it — a user id, or the system when no request was responsible.        |
| **Retention**   | How long an entry survives. Enforced by a TTL index, not by application code. |

## `cart`

| Term             | What it means here                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cart**         | One open basket per user. Priced against the live catalogue, so its total is a quote and not a promise.                                                               |
| **Cart line**    | A product reference and a quantity. Holds no price — the catalogue does.                                                                                              |
| **Checkout**     | The act of turning a cart into an order and holding its units. Succeeds or leaves both the cart and the shelf untouched; there is no half-checked-out state.          |
| **Availability** | What a line may be checked out against — the catalogue’s units less those already held. Checked here only as a pre-flight; `inventory` re-checks it inside the write. |
| **Version**      | The count of writes a cart has seen. Guards checkout against a concurrent edit — hand-rolled aggregate versioning, in all but name.                                   |

## `delivery`

| Term                | What it means here                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Shipping method** | A named way to ship, with a rate rule. A closed set in `domain/rates.ts`, not a collection.                                 |
| **Shipping cost**   | What a method charges for a given basket. Computed by a pure function so the cart can quote it without a shipment existing. |
| **Shipment**        | The parcel record for an order that has actually shipped. Created on the status change, never before.                       |
| **Courier**         | The carrier moving a shipment. Faked here, behind the same seam a real integration would use.                               |

## `feedback`

| Term                | What it means here                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **Contact request** | A message from anyone, account or not. Identified by the email on the form, never by a user reference. |
| **Triage**          | The admin state of a request — read, handled, closed. The only thing about it that changes.            |

## `inventory`

| Term               | What it means here                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **On hand**        | Units physically present, whether or not anyone has claimed them.                                                                                |
| **Reserved**       | Units an open order has claimed. Still on the shelf, no longer for sale.                                                                         |
| **Available**      | On hand minus reserved — what a customer may buy. Derived everywhere, stored nowhere.                                                            |
| **Reservation**    | One order’s hold on its units, with a deadline. Ends as a commit, a release or an expiry — never by being deleted.                               |
| **Transition**     | One of the six ways a counter may move. Each implies a fixed pair of deltas (`domain/transitions.ts`) and each writes exactly one ledger row.    |
| **Stock movement** | A ledger row: which product, which transition, and both signed deltas. Written by the same call that moved the counter, so it cannot be missing. |
| **Sweep**          | The expiry tick. An operator is the cron, exactly as with the fake courier in `delivery`.                                                        |

## `locales`

| Term           | What it means here                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**   | A tag this deployment offers, from either tier. Registering one in the database never teaches the API to answer in it — only a deployed file does that.   |
| **Entry**      | One translated string: a language, a dotted key and its text. Stored one row per pair, so a key is editable on its own.                                   |
| **Dictionary** | The nested tree a client consumes, built from entries on read. Never stored in that shape — the rows are flat because flat is what is editable.           |
| **Scope**      | What a language can do here — answer API requests, offer a downloadable dictionary, or both. The two are independent facts and the manifest reports both. |

## `observability`

| Term         | What it means here                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Health**   | Whether the process can serve. A liveness answer, not a correctness one.                              |
| **Overview** | The numbers a human reads. Assembled from `infrastructure/observability`, owned by nobody.            |
| **Stream**   | The live SSE feed of those numbers. Cookie-authenticated, because an EventSource cannot set a header. |
| **Scrape**   | The Prometheus endpoint. Static credential, because the caller is a machine with no session.          |

## `orders`

| Term             | What it means here                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Order**        | What a customer bought, frozen. Immutable in substance: only its status moves.                                                                                                                 |
| **Order item**   | A line holding an embedded copy of the product as it stood at purchase time, not a reference to it.                                                                                            |
| **Status**       | Where an order is in its lifecycle. A closed set from the contract, moving along the edges `domain/lifecycle.ts` declares — every guard in this module and in `payments` reads that one table. |
| **Cancellation** | A status change that releases the order’s held units and triggers a refund. Legal from the statuses the lifecycle table gives a customer — `pending` and `paid`.                               |
| **Expiry**       | A cancellation the shop initiates because the order’s hold on its units ran out before payment did. Arrives as `inventory.reservation_expired`.                                                |
| **Total**        | Line price × quantity, summed in minor units and returned as a decimal. Computed, never stored as truth.                                                                                       |

## `payments`

| Term         | What it means here                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intent**   | A frozen amount for an order, before any money moves. Freezing is the point — the order may still be edited, the amount may not.                                                            |
| **Confirm**  | The provider’s yes. Moves the order to `paid`; nothing else in the app may set that status — the order lifecycle gives that edge to `system` alone, so an operator cannot write it by hand. |
| **Refund**   | Money returned because an order was cancelled. Answered to `order.cancelled`, never requested directly.                                                                                     |
| **Provider** | The outside system that actually moves money, reached only through `./providers`.                                                                                                           |

## `products`

| Term            | What it means here                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**     | A sellable item in the catalogue. Identified by id; the name is not unique.                                                                                                            |
| **On hand**     | Units physically present. Stored here because this module owns the collection, but never written here — see `Counter`.                                                                 |
| **Reserved**    | Units already claimed by an open order. Present on the shelf, not for sale. Stored here, written by `inventory`.                                                                       |
| **Available**   | On hand minus reserved — what a customer may actually buy. Derived at serialization, never stored, so it cannot go stale.                                                              |
| **Counter**     | Either of the two stored numbers. This module declares them and reads them; every write goes through `inventory`, which owns the transitions and the ledger row that records each one. |
| **Soft delete** | Withdrawal from sale, reversible. The row survives so orders that embedded it stay readable.                                                                                           |

## `users`

| Term            | What it means here                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **User**        | The person record. Owns identity and the admin flag; owns no credentials workflow — see `account`.                        |
| **Admin**       | A flag on the User, not a role table. Two levels of access is the whole model.                                            |
| **Token**       | A single-use secret bound to a user and a purpose (`TokenType`), stored on the record.                                    |
| **Soft delete** | A destroyed account, kept for the audit trail. Emits `user.deleted`, which is what actually clears the cart and wishlist. |

## `wishlist`

| Term             | What it means here                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Wishlist**     | One saved list per user. Holds product references and nothing else — no quantity, no price, no expiry. |
| **Move to cart** | The list’s only exit: a saved line becomes a cart line and leaves the list.                            |
