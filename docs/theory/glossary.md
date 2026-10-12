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

See [Strategic DDD](./strategic-ddd.md#_3-ubiquitous-language-—-per-context-not-per-app) for why the
language is kept per context rather than shared.

---

## `account`

| Term                 | What it means here                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **Session**          | Proof of who is asking, carried in cookies. An access token to spend and a refresh token to renew it. |
| **Access token**     | Short-lived bearer of identity. Never stored — if it is valid it is trusted.                          |
| **Refresh token**    | Long-lived, revocable, stored on the User record. Losing it is what logging out means.                |
| **Account deletion** | Two steps — a request that issues a token, and a confirm that destroys the record. Never one call.    |

## `access`

| Term           | What it means here                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant**     | The shop (or the platform) a role is held in. A membership is always one person, one tenant, one role.                                             |
| **Membership** | The stored ASSIGNMENT of a role to a user in a tenant. A role's own permissions are never stored — they live in `shared/authorization-roles.yaml`. |
| **Level**      | `admin`, `staff` or `user`: the rank a role carries. A write on someone else's thing needs the owner strictly below the caller.                    |

## `addresses`

| Term             | What it means here                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Address**      | An entry in a user's address book. The one collection this module owns outright.               |
| **Address book** | One document per user, holding their saved shipping addresses; a checkout resolves against it. |

## `antibot`

| Term             | What it means here                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Provider**     | The active human-challenge implementation (`none`, `altcha`, `turnstile`), picked by `NODE_ANTIBOT_PROVIDER` — this module publishes which one, it never runs the gate itself. |
| **Verdict**      | `'ok'` or `'refused'`, what a guarded check (a challenge, an email policy) answers — never a raw boolean, so a caller cannot mistake `undefined` for a pass.                   |
| **Email policy** | How hard to look at a submitted address before trusting it: `off`, `disposable` (deny known throwaway domains) or `mx` (require a resolvable mail exchanger).                  |

## `api-keys`

| Term                    | What it means here                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API key**             | A machine-to-machine credential, `sk_...`, that authenticates a request the way a JWT does — minted, listed and revoked here, the only module that reads or writes the `apikeys` collection. |
| **Mint**                | Issue a new key. Its permissions are always a SUBSET of the minter's own, re-checked at mint time and at every use — never a caller-chosen superset.                                         |
| **Credential resolver** | The `kernel/authentication.ts` port this module fills, so an `sk_...` bearer resolves to a caller the same way a refresh session does.                                                       |

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

| Term                  | What it means here                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shipping method**   | A named way to ship, with a rate rule. A closed set in `domain/rates.ts`, not a collection.                                                                                                                                                                                                                  |
| **Shipping cost**     | What a method charges for a given basket. Computed by a pure function so the cart can quote it without a shipment existing.                                                                                                                                                                                  |
| **Fulfillment order** | A group of an order's lines that should leave together, made by rule when the order is paid (Shopify's `FulfillmentOrder`). A normal order gets one; a preorder's lines get their own, on hold until the stock arrives. Its status is derived from its lines and its hold, never set by a caller.            |
| **Shipment**          | What actually left, at one time, with one tracking code (Shopify's `Fulfillment`). An order has as many as it takes. Recording it IS what moves the status — never the other way around.                                                                                                                     |
| **Remaining**         | `quantity − shippedQuantity − cancelledQuantity` on a fulfillment order's line. Served by the API, so no client counts.                                                                                                                                                                                      |
| **Hold**              | A reason a fulfillment order may not ship: `awaiting_stock` (set and released only by the stock allocation), or one of staff's (`incorrect_address`, `high_risk`, `other`, with a note).                                                                                                                     |
| **Handover**          | Staff cutting a shipment from a fulfillment order — the ship door's own act. Requires a tracking code when the method is tracked; the order moves to `shipped` only when nothing remains anywhere.                                                                                                           |
| **Delivery proof**    | Staff recording that a shipment arrived — the deliver door's own act. The order moves to `delivered` on the last one, and the withdrawal window runs from THAT arrival. No document is captured; the record itself is the proof.                                                                             |
| **Override**          | A staff correction outside the ordinary sequence, always with a reason: `forced` on a handover or delivery-proof recording (skips a step, still creates the real record), or the status-only override (delivery then brings its records in step, with no email). Never reaches `paid`, never moves backward. |

## `feedback`

| Term                | What it means here                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact request** | A message from anyone, account or not. Identified by the email on the form, never by a user reference.                                             |
| **Triage**          | The admin state of a request — `new`, `in_progress`, `resolved` or `spam`. The only thing about it that changes; staff may move it to any of them. |

## `inventory`

| Term               | What it means here                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On hand**        | Units physically present, whether or not anyone has claimed them. Stored on this module's own `stocklevels` collection — the source of truth.                                                                                                   |
| **Reserved**       | Units an open order has claimed. Still on the shelf, no longer for sale.                                                                                                                                                                        |
| **Available**      | On hand minus reserved, clamped at zero — what a customer may buy. Stored and kept in step by `applyTransition`, the one writer.                                                                                                                |
| **Reservation**    | One order’s hold on its units, with a deadline. Ends as a commit, a release or an expiry — never by being deleted.                                                                                                                              |
| **Transition**     | One of the nine ways a counter may move (`reserve`, `ship`, `release`, `expire`, `receive`, `adjust`, `restock`, `preorder`, `allocate`). Each implies a fixed pair of deltas (`domain/transitions.ts`) and each writes exactly one ledger row. |
| **Stock movement** | A ledger row: which product, which transition, and both signed deltas. Written by the same call that moved the counter, so it cannot be missing.                                                                                                |
| **Sweep**          | The expiry tick. An operator is the cron — the application ships no scheduler of its own.                                                                                                                                                       |

## `invoicing`

| Term            | What it means here                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Invoice**     | The legal record of a paid order, frozen at issue and never re-read from the order. Reached only as a rendered PDF.         |
| **Credit note** | The reversal of ONE refund: a full refund mirrors the invoice, a partial one carries only the refunded share.               |
| **Number**      | `{year}-{sequence}`, gap-free, one series per document kind — a credit note never borrows a number from the invoice series. |

## `locales`

| Term           | What it means here                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**   | A tag this deployment offers, from either tier. Registering one in the database never teaches the API to answer in it — only a deployed file does that.                                   |
| **Entry**      | One translated string: a language, a dotted key and its text. Stored one row per pair, so a key is editable on its own.                                                                   |
| **Dictionary** | The nested tree a client consumes, built from entries on read. Never stored in that shape — the rows are flat because flat is what is editable.                                           |
| **Tenants**    | What a language can do here — the `backend` tenant answers API requests, a frontend tenant offers a downloadable dictionary. The two are independent facts and the manifest reports both. |

## `notifications`

| Term             | What it means here                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Notification** | One message in a user's inbox, written by a domain event. Stays until its owner deletes it or the per-user cap pushes it out. |
| **Inbox**        | A user's notifications, newest `NODE_NOTIFICATIONS_MAX_PER_USER` kept, pushed live over SSE.                                  |

## `observability`

| Term         | What it means here                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Health**   | Whether the process can serve. A liveness answer, not a correctness one.                              |
| **Overview** | The numbers a human reads. Assembled from `infrastructure/observability`, owned by nobody.            |
| **Stream**   | The live SSE feed of those numbers. Cookie-authenticated, because an EventSource cannot set a header. |
| **Scrape**   | The Prometheus endpoint. Static credential, because the caller is a machine with no session.          |

## `orders`

| Term             | What it means here                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Order**        | What a customer bought, frozen. Immutable in substance: only its status moves.                                                                                                                                                     |
| **Order item**   | A line holding an embedded copy of the product as it stood at purchase time, not a reference to it.                                                                                                                                |
| **Status**       | Where an order is in its lifecycle. A closed set from the contract, moving along the edges `domain/lifecycle.ts` declares — every guard in this module, and the ones its siblings ask through `orders`, read that one table.       |
| **Cancellation** | A status change that releases the order’s held units and triggers a refund. Legal from the statuses the lifecycle table gives the actor — `pending` and `paid` for a customer, `processing` as well for staff.                     |
| **Expiry**       | A cancellation the shop initiates because the order’s hold on its units ran out before payment did. Arrives as `inventory.reservation_expired`.                                                                                    |
| **Total**        | Line price × quantity, summed in minor units and returned as a decimal. Computed, never stored as truth.                                                                                                                           |
| **Override**     | A staff correction of the status outside the ordinary lifecycle table, always with a reason and always recorded on the order — see `delivery`'s own entry for the two shapes it takes. Never reaches `paid`, never moves backward. |

## `payments`

| Term         | What it means here                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intent**   | A frozen amount for an order, before any money moves. Freezing is the point — the order may still be edited, the amount may not.                                                             |
| **Confirm**  | The provider’s yes. Moves the order to `paid`; nothing else in the app may set that status — the order lifecycle gives that edge to `system` alone, so an operator cannot write it by hand.  |
| **Refund**   | Money returned because an order was cancelled, or landed on one no longer payable. Answered to `order.refund_owed`, never requested directly (apart from an operator's own goodwill refund). |
| **Provider** | The outside system that actually moves money, reached only through `./providers`.                                                                                                            |

## `products`

| Term            | What it means here                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**     | A sellable item in the catalogue. Identified by id; the name is not unique.                                                                                                                   |
| **Available**   | A read-only cached copy of `inventory`'s own figure, kept in step by a synchronous call inside `applyTransition` — never written here. See `inventory`'s own entries for the source of truth. |
| **Soft delete** | Withdrawal from sale, reversible. The row survives so orders that embedded it stay readable.                                                                                                  |

## `returns`

| Term             | What it means here                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Return**       | A request to send goods back, keyed by order and never by user, so erasing an account leaves it with no personal data. Its `kind` is `return` or `cancellation`.                    |
| **Cancellation** | A Return of `kind: cancellation`, closed when made: the unshipped remainder of one fulfillment order, cancelled and refunded. The only cancel an order that shipped in part allows. |
| **Status**       | `requested`, `approved`, `declined`, `received` or `closed`; each write is a conditional claim from a fixed set of statuses.                                                        |
| **Withdrawal**   | The EU right to cancel a distance sale; the order carries the deadline (`withdrawUntil`) and a return can be raised against it.                                                     |

## `users`

| Term            | What it means here                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **User**        | The person record. Owns identity and the `role` name; owns no credentials workflow — see `account`.                              |
| **Role**        | A named permission set on the User (`shared/authorization-roles.yaml`), not a boolean — see [authorization](./authorization.md). |
| **Token**       | A single-use secret bound to a user and a purpose (a `verificationtokens` row, its kind from a closed list).                     |
| **Soft delete** | A destroyed account, kept for the audit trail. The cart and wishlist go only with a hard delete.                                 |

## `webhooks`

| Term             | What it means here                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Subscription** | One endpoint, owned by whoever configured it, listening for a set of event types. The unit an auto-disable acts on.                                                                                                       |
| **Delivery**     | One attempt to POST one event to one subscription. Tracked through `pending` → `in-flight` → `succeeded`/`exhausted`.                                                                                                     |
| **Lease**        | A visibility timeout on an `in-flight` delivery (`leaseExpiresAt` + a claim token) — only the holder may write the outcome, and an expired lease is picked up again, so a crash mid-delivery cannot strand a row forever. |
| **Ladder**       | The five-step retry schedule (5s, 5m, 30m, 2h, 10h) a failing subscription climbs — about a subscriber being down, distinct from the broker's own short-lived job retries.                                                |
| **Auto-disable** | What happens after `WEBHOOK_MAX_CONSECUTIVE_FAILURES` (5) consecutive exhausted chains — the subscription turns off and its owner is emailed.                                                                             |
| **Envelope**     | The Standard Webhooks body shape, `{ type, timestamp, data }` — `type` is what lets a receiver subscribed to two event types on the same signal tell them apart.                                                          |

## `wishlist`

| Term             | What it means here                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Wishlist**     | One saved list per user. Holds product references and nothing else — no quantity, no price, no expiry. |
| **Move to cart** | The list’s only exit: a saved line becomes a cart line and leaves the list.                            |
