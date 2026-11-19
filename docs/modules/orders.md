---
type: concept
audience: [developer]
---

# orders

What a checkout produces: its status machine, its totals and its invoice link.

::: tip At a glance
**Owns** — placed orders: the line items frozen at purchase time, the status machine, and what cancelling restores.
**Depends on** — [`access`](./access.md) for the audit flag of a cancel on the caller's own order, [`inventory`](./inventory.md) for the units, [`products`](./products.md) for the shape it embeds, [`shop`](./shop.md) for the currency and seller, and [`users`](./users.md) for a buyer's locale and the erase hook.
**Breaks if you change** — the `status` enum. `delivery` (status change, cancel, override), `payments` (cancel) and `invoicing` (status change) react to transitions in it, and `webhooks` relays them.
:::

## Its neighbourhood

<!-- module-graph:orders:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    orders["orders<br/><i>this module</i>"]
    access["access"]
    account["account"]
    cart["cart"]
    delivery["delivery"]
    inventory["inventory"]
    invoicing["invoicing"]
    payments["payments"]
    products["products"]
    returns["returns"]
    shop["shop"]
    shop_tasks["shop-tasks"]
    stats["stats"]
    users["users"]

    cart --> orders
    delivery --> orders
    invoicing --> orders
    payments --> orders
    returns --> orders
    shop_tasks --> orders
    stats --> orders
    orders --> access
    orders --> account
    orders --> inventory
    orders --> products
    orders --> shop
    orders --> users
    inventory -. "inventory.reservation_expired" .-> orders
    orders -. "order.canceled" .-> delivery
    orders -. "order.redacted" .-> delivery
    orders -. "order.status_changed" .-> delivery
    orders -. "order.status_overridden" .-> delivery
    orders -. "order.billing_corrected" .-> invoicing
    orders -. "order.status_changed" .-> invoicing
    orders -. "order.canceled" .-> payments
    orders -. "order.created" .-> payments
    orders -. "order.canceled" .-> shop_tasks
    orders -. "order.purchase_hold_placed" .-> shop_tasks

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,products core;
    class delivery,inventory,invoicing,payments,returns,shop,shop_tasks,stats supporting;
    class access,account,users generic;
    class orders centre;
```

<!-- module-graph:orders:end -->

## Who can do what

Every rule this module declares and who holds it, role by role. The rule is what a route guard asks for; the set is what a role lists.

<!-- permissions:start -->

| Rule             | Set             | `guest` | `unverified` | `customer` | `manager` | `warehouse` | `support` | `editor` | `moderator` | `admin` | `operator` | Credential | What it lets them do                                                                                                                  |
| ---------------- | --------------- | ------- | ------------ | ---------- | --------- | ----------- | --------- | -------- | ----------- | ------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `read:Order`     | `OrderOwn`      | —       | ✅ own       | ✅ own     | ✅ own    | ✅ own      | ✅ own    | ✅ own   | ✅ own      | ✅ own  | —          | —          | Read the caller's own orders.                                                                                                         |
| `display:Order`  | `OrderDisplay`  | —       | —            | —          | ✅        | ✅          | ✅        | —        | ✅          | ✅      | —          | ✅         | Read every order in the shop — the support desk and the warehouse, who help with or pack an order that is never their own.            |
| `create:Order`   | `OrderCreation` | —       | —            | —          | ✅        | —           | —         | —        | —           | ✅      | —          | ✅         | Raise an order on someone else's behalf. Checking out is not this key.                                                                |
| `update:Order`   | `OrderEditing`  | —       | —            | —          | ✅        | —           | —         | —        | ✅          | ✅      | —          | ✅         | Move an order along its status path.                                                                                                  |
| `delete:Order`   | `OrderRemoval`  | —       | —            | —          | ✅        | —           | —         | —        | —           | ✅      | —          | ✅         | Remove an order.                                                                                                                      |
| `override:Order` | `OrderOverride` | —       | —            | —          | —         | —           | —         | —        | —           | ✅ ⚡c  | —          | —          | Skip the normal lifecycle gate to force a delivery move, or correct a status by hand, with a recorded reason.                         |
| `export:Order`   | `OrderExport`   | —       | —            | —          | ✅ ⚡s    | —           | —         | —        | —           | ✅ ⚡s  | —          | —          | Take every order out of the shop as a CSV file, customer emails included. An API key cannot use it, since its step-up needs a person. |

✅ held · `own` only the caller’s own rows · ⚡c / ⚡s needs a freshly proved session (critical / sensitive) ·
Credential: ✅ when an API key can be minted with the rule. Generated from the rules and sets in
`src/modules/*/authorization.yaml` and the roles in `shared/rules/authorization-roles.yaml`, asked of the
evaluator — [Authorization](../understand/authorization.md) explains the model.

<!-- permissions:end -->

## The story

This is the module with the real invariants: what an order totals, which status transitions are
legal, and what cancelling gives back. If any module here ever grows a proper aggregate, it is
this one.

**An order embeds a snapshot of the catalogue row rather than referencing it.** `items` carries its
own `orderLineProductSchema` — the OpenAPI `OrderLineProduct` shape, not `Product` — populated at
purchase time from [`products`](./products.md)'s live row, so a later edit cannot rewrite the
history of an order placed last March. It is deliberately its OWN schema rather than a reuse of
the catalogue's: `onHand` and `reserved` describe the warehouse right now, and an order line has no
path to store either — the alternative is an invoice that quietly republishes live stock as if it
were history.

The snapshot's `title`/`description` are already RESOLVED, not the product's raw fallback-locale
column: `items[].locale` (required on `OrderItem`) freezes which language they were resolved into at
purchase time, so an order confirmation and its invoice read in the buyer's language rather than
whatever the storefront happened to be showing. Reading the order back later must reproduce exactly
that, never re-resolve against whoever is reading it now — see
[Internationalisation](../understand/i18n.md#tier-3-user-authored-content).

The snapshot also freezes what a preorder promised: `preorder: true` and the `releaseDate` the
buyer saw. Both are decided once at checkout and never re-derived: the date passing, or an admin moving
it, must not change what this order bought (CRD Art. 18 treats the date shown when ordering as the
agreed one), and a bank transfer may be paid a week after the order was placed.
[`delivery`](./delivery.md) groups the lines into fulfillment orders from this frozen pair, and the
hold takes the product's preorder allowance instead of a shelf unit.

The status enum is the module's public vocabulary:

| Status                  | What it means                                | Who moves it                                                                                                                                                             |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending`               | created, unpaid, units held                  | checkout or an admin                                                                                                                                                     |
| `paid`                  | money taken, units committed                 | [`payments`](./payments.md) on confirm                                                                                                                                   |
| `processing`            | fulfilment started                           | [`delivery`](./delivery.md), reporting a recorded fulfillment-start fact (until that door exists, an admin correction)                                                   |
| `shipped` · `delivered` | fulfilment                                   | [`delivery`](./delivery.md): `shipped` once the LAST unit has left (an order shipped in parts stays `processing` until then), `delivered` once the last shipment arrived |
| `canceled`              | units released, refund issued if one was due | admin, or an expired hold. A product hidden, taken off sale or removed afterwards does not cancel it ([why](./products.md#hiding-taking-off-sale-removing))              |

An operator's cancel (a caller holding `update:Order`) asks for a fresh session first, since it
can refund or keep a paid order's money (`401 REAUTH_REQUIRED` on a stale one); the buyer's own
cancel is never prompted. Holding the key is the whole rule: there is no rank, so an operator
cancels a staff member's order, or their own, like anyone's.

### The cancel doors

Cancelling has one door per reason, over one private `cancel` and one table of causes
(`CANCEL_CAUSES` in `services/cancel.ts`). The reason is a value the caller states by choosing a
door, never inferred from which argument was left out. The table decides the lifecycle column the
move is read from, the mail, the analytics event name and whether the caller picks the refund.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 25, 'rankSpacing': 40}}}%%
flowchart LR
    R["POST /orders/{id}/cancel"] --> D1["cancelOnRequestById"]
    W["returns: a withdrawal"] --> D2["withdrawById"]
    X["inventory: a hold timed out"] --> D3["expireReservationById"]
    E["users: an account erased"] --> D4["cancelForErasureById"]
    P["payments: a payment mismatch"] --> D5["cancelForPaymentMismatchById"]
    D1 -->|"update:Order held?"| C["private cancel(id, cause)"]
    D2 --> C
    D3 --> C
    D4 --> C
    D5 --> C
    C --> T["CANCEL_CAUSES<br/><i>column, mail, analytics, refund rule</i>"]
    T --> M["one transaction: status, stock,<br/>order.canceled { refund }"]
```

| Door                           | Cause                 | Column     | Buyer is mailed        | Refund                                |
| ------------------------------ | --------------------- | ---------- | ---------------------- | ------------------------------------- |
| `cancelOnRequestById`          | `customer`            | customer   | the cancelled notice   | always                                |
| `cancelOnRequestById`          | `operator`            | admin      | the cancelled notice   | the operator's `refund`, default true |
| `withdrawById`                 | `withdrawal`          | withdrawal | `returns` acknowledges | always                                |
| `expireReservationById`        | `reservation_expired` | system     | the expiry notice      | whatever was paid                     |
| `cancelForErasureById`         | `erasure`             | system     | nobody                 | whatever was paid                     |
| `cancelForPaymentMismatchById` | `payment_mismatch`    | system     | nobody                 | whatever was paid                     |
| `markUndeliverable`            | `lost`                | system     | nobody                 | none: the remainder cancel refunded   |

The one door that serves two actors, `cancelOnRequestById`, resolves which inside the service: a
caller holding `update:Order` is the operator. The controller never makes that decision. A new
reason is a new row and a new door.

Any of these except `paid` (`system`-only, absolute) can also be reached by an admin override with
a reason — see [Who writes the status](#who-writes-the-status) below.

::: warning Two modules reach back, and both do it through events
[`inventory`](./inventory.md) cancels an order when its hold times out (`inventory.reservation_expired`), and
this module announces `order.canceled` with the `refund` it owes, so [`payments`](./payments.md)
can open the refund from the same outbox row. Neither is an import, which is what keeps a mutually-aware pair acyclic.
The `refund` flag is the cancel's policy, for `payments` alone: the public `order.canceled` webhook
carries only `{ orderId }`, since "owed" is not "paid back", and a subscriber hears `payment.refunded`
when money actually moved.
:::

Each account reads back only its own orders; writing and soft-deleting is admin-only, and an order can be soft-deleted (hidden) only once it is `canceled`. The
`userId: 1, deletedAt: 1` index is what makes both of those cheap at once.

One scheduled job via `docker/crontab`: `npm run job reap:orders`, nightly, replaces an order's
remaining PII (email, shipping name/phone/street, notes) with placeholders once
the order's claim window has closed (a never-paid order once canceled, a delivered one after `conformityUntil`, an undelivered paid one 540 days after `paidAt`; [the rule](../understand/data-retention.md#orders-after-the-account)) — amounts, line items and dates survive, only the person is gone. An account inactive past `NODE_INACTIVE_MINIMISE_DAYS` starts the same clock through this
module's `personalData.minimise` hook, keeping its `userId`; a live, active account's orders keep
their personal fields, since order history is part of the contract
([why](../understand/data-retention.md#orders-kept-while-the-account-lives)). Each scrub is announced:
the sweep works in batches of 500, and a batch scrubs its orders and writes one `order.redacted`
outbox row each (`data: { orderId }`) in the same transaction, so the
[webhook](./webhooks.md) exists exactly when the scrub does (GDPR Art. 19). It fires when the data
goes, not at the erasure, which only detaches `userId`. An admin can still hard-delete an order, but only one that is `canceled` and was never paid
(`services/remove.ts`'s `remove`): the cancel owns every end-of-order effect (stock, payment intent,
`order.canceled`), so an open order answers 409 `ORDER_NOT_CANCELED` until it is cancelled. This
reap is what protects the far more common case, the order nobody ever deletes. An order that was
never paid but was handed money after its cancel (a transfer or card payment that landed late, and
its refund) refuses it too, 409 `ORDER_HAS_MONEY_HISTORY`: `payments` stamps `moneyReceivedAt`
(`markMoneyReceived`) in the settlement's own transaction, and the delete filters on it, so a
payment landing mid-delete turns it into the 409. A paid order refuses
a hard delete instead (409 `ORDER_INVOICED`), once and for as long as `paidAt` is stamped:
`invoicing` freezes a legal document from that same transition, and it must survive the order it
was issued for. The refusal does not trust the document the caller read: the hard delete is one
`deleteOne` that filters on `status: canceled` and `paidAt: null`, so a settlement or a reopen
that commits in between turns it into the matching 409. Restoring a soft delete of an order that is
not hidden answers 409 `ORDER_NOT_DELETED`; `actions.restore` says when it would be accepted.

## When the account is erased

A hard delete of an account runs `orders`' `personalData.erase` hook inside the erasure
transaction. Two things happen to the account's orders, by whether the buyer ever paid:

| Order                                           | What erasure does                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Paid (`paidAt` set), in any status              | Detached (`userId` unset) and scheduled for scrubbing, nothing else: it is the invoice |
| Never paid (`paidAt` unset) and still `pending` | Detached, due for scrubbing at once, **and cancelled**                                 |

```mermaid
sequenceDiagram
    participant U as users (hard delete)
    participant O as orders (erase hook)
    participant S as cancelForErasureById
    U->>O: erase(userId, session)
    O->>O: read the never-paid pending ids, then detach
    O-->>U: a cancel to run after the commit
    U->>U: commit the transaction
    U->>S: cancel each order as the system
    S->>S: release the stock hold
    S->>S: order.canceled, so payments cancels the open intent
```

The cancel is the system's own (`cancelForErasureById`, the lifecycle column the reservation
sweep's expiry uses), so it releases the hold and, through `order.canceled`, cancels the payment
intent. It runs after the commit because it
moves stock and talks to a provider, neither of which a rolled-back erasure could undo. It sends
no mail: the address belongs to an account that no longer exists. A failed cancel is logged and
never undoes the erasure; the sweep still cancels it when the hold times out (up to 168 hours for
a bank transfer).

## Creating an order {#creating-an-order}

Every order, whoever makes it, is written through exactly one function — `placeOrder`
(`services/place.ts`): freeze the lines against the catalogue, hold the stock, allocate the order
number, write the row. A `bank_transfer` order's reference, instructions and payment are
[`payments`'](./payments.md#bank-transfer): its `order.created` listener opens them. **The hold comes before the write, deliberately**: a refused hold then writes
nothing at all — no order to roll back and no order number burned on a sale that never happened.
Everything caller-specific — payment-method validation, the open-order cap (owned by `cart`), resolving a shipping
address or method, cart pre-flight and clearing — stays with the caller; `placeOrder` only takes
what it needs to hold and write. See [Checkout](./cart-checkout.md#the-sequence) for the storefront
path in full.

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#creating-an-order).

## The pipeline

The status enum above, drawn. Every solid edge is someone deciding; the dotted ones are this
module announcing and a sibling reacting.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    P["pending<br/><i>created · units held</i>"] -->|"payments confirms<br/>(system)"| PA["paid<br/><i>units committed</i>"]
    PA -->|"system, via<br/>delivery's process door"| PR["processing"]
    PR -->|"system: the shipment that leaves<br/>nothing remaining"| SH["shipped"]
    SH -->|"system: the last shipment arrives"| DE["delivered"]
    SH -->|"system, a backward move:<br/>a shipment is reported lost"| PR
    DE -->|"system, a backward move:<br/>a replacement under the guarantee"| PR
    PR -->|"system: every parcel lost, remainder<br/>canceled and refunded (cause lost)"| CA
    PR -->|"system: a digital fulfillment, or a<br/>remainder canceled after every<br/>shipment arrived — both moves at once"| DE
    P -.->|"admin · or an expired hold"| CA["canceled<br/><i>units released</i>"]
    PA -.->|"admin · refund due"| CA
    CA -. "order.canceled" .-> PM["payments<br/><i>refunds if one was due</i>"]

    classDef open fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#111827;
    classDef peer fill:#dbeafe,stroke:#2563eb,color:#111827;
    class P,PR,SH open;
    class PA,DE done;
    class CA bad;
    class PM peer;
```

Every one of these edges is still written by `orders` alone — `delivery`, `payments` and an admin
override all ASK for a move, never assign the field themselves. See
[Tactical DDD](../understand/tactical-ddd.md#who-writes-the-status) for the placement rule and
[Who writes the status](#who-writes-the-status) below for the permission rule and the override.

## Who writes the status {#who-writes-the-status}

Full detail: [Order status and timeline](./orders-status-and-timeline.md#who-writes-the-status).

### The fulfilment summary {#the-fulfilment-summary}

See [Order status and timeline](./orders-status-and-timeline.md#the-fulfilment-summary).

### Status traits {#status-traits}

See [Order status and timeline](./orders-status-and-timeline.md#status-traits).

### The admin override {#the-admin-override}

See [Order status and timeline](./orders-status-and-timeline.md#the-admin-override).

## The timeline {#the-timeline}

What happened to an order, a page at a time, newest first: `GET /orders/{id}/timeline`. One append-only collection,
`orderevents`, owned by `orders` and typed as an `AppendOnlyLedger` (the stock-movement precedent).
It is its own collection because the alternatives fail: an array on the order collides with the
conditional status writes siblings make in their own transactions, the audit log expires on a
window (`NODE_AUDIT_RETENTION_DAYS`), and rebuilding from the siblings would need reads `orders` may not make.

Full detail: [Order status and timeline](./orders-status-and-timeline.md#the-timeline).

### Staff notes {#staff-notes}

See [Order status and timeline](./orders-status-and-timeline.md#staff-notes).

## The CSV export {#the-csv-export}

`GET /orders/export` answers the list's filters as one `text/csv` file, for reconciliation and the
accountant. A staff-only door, and a sharp one: the file holds every matching customer's email.

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#the-csv-export).

## Reads other modules compose {#reads-other-modules-compose}

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#reads-other-modules-compose).

## The invoice {#the-invoice}

`orderNumber` is Shopify's `#1001`, not a fiscal sequence: gaps are fine, and it names this
order alone. Its year is the shop calendar's (`NODE_SHOP_TIMEZONE`), the same cut the invoice series
uses, so order `2026-x` never gets invoice `2027-y`. The actual tax invoice — a frozen document, its own numbering series, credit notes on
refund — is [`invoicing`](./invoicing.md), a module this one has no import of and no wiring for:
`invoicing` depends on `orders`, never the reverse, and reaches its own `GET /orders/{id}/invoice`
and `GET /orders/{id}/credit-notes` by sharing this module's `/orders` basePath (the same pattern
[`addresses`](./addresses.md) uses on `/account`).

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#the-invoice).

## The withdrawal window {#the-withdrawal-window}

The EU right of withdrawal (Consumer Rights Directive Art. 9 and 11a) is decided here and made in
[`returns`](./returns.md#the-withdrawal-button). `orders` cannot import `returns`, `payments` or `delivery`, so what it
owns is the clock and the button:

Full detail: [Withdrawal window, purchase hold and shop identity](./orders-withdrawal-and-hold.md#the-withdrawal-window).

## Correcting the shipping address {#correcting-the-shipping-address}

`PUT /orders/{id}/shipping-address` (`update:Order`) replaces where an order ships, for the case a held
`incorrect_address` fulfillment order creates: nothing else could change an address after checkout.
Shopify allows it on a partly fulfilled order too, and Solidus keeps the address a carton shipped to;
the buyer's own edit is a later, optional step.

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#correcting-the-shipping-address).

## Correcting the billing address {#correcting-the-billing-address}

`PUT /orders/{id}/billing-address` (`update:Order`) replaces who the order is invoiced to, with an
optional buyer VAT number: the case where the buyer writes in that the name, address or VAT number
on the invoice is wrong. Unlike the shipping one it is accepted at any status, because an invoice
may already exist.

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#correcting-the-billing-address);
what happens to the invoice: [`invoicing`](./invoicing.md#correcting-the-buyer).

## Cancel and refund mails {#cancel-and-refund-mails}

Every cancel and every refund leaves one written trace, and each has exactly one mail:

Full detail: [Creating an order, exports and mails](./orders-creation-and-exports.md#cancel-and-refund-mails).

## The purchase hold {#the-purchase-hold}

A protective pause, not a punishment: a buyer whose UNPAID orders fall through `NODE_PURCHASE_HOLD_CANCEL_COUNT`
(3) times inside `NODE_PURCHASE_HOLD_WINDOW_DAYS` (7) has their NEXT checkout answered
`409 CART_PURCHASE_HOLD`, so a person looks before a bot or a loop does damage. Every cancel is still
processed normally; the rule acts after the third is accepted.

Full detail: [Withdrawal window, purchase hold and shop identity](./orders-withdrawal-and-hold.md#the-purchase-hold).

## Shop identity {#shop-identity}

The legal identity belongs to [account](./account.md#operator-identity) (`operatorIdentity()`, which
the withdrawal notice prints); the return address, the phone and who pays the return postage belong
to [shop](./shop.md). `orders` reads both. A partly-set return address counts as none.

Full detail: [Withdrawal window, purchase hold and shop identity](./orders-withdrawal-and-hold.md#shop-identity).

## Configuration

| Variable                                                             | Default | Meaning                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_WITHDRAWAL_PERIOD_DAYS`                                        | `30`    | Days a consumer has to withdraw. The legal 14 plus the margin in [the withdrawal window](#the-withdrawal-window) gives a floor of 21, so a smaller value is refused at read; the default is 30 |
| `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE`                                | `0`     | Days after a delivered order's `conformityUntil` before `reap:orders` replaces its remaining personal data with placeholders (once the account is erased or minimised)                         |
| `NODE_ORDER_PII_DAYS_UNDELIVERED`                                    | `540`   | The same for a paid order that ended without delivery, counted from `paidAt`                                                                                                                   |
| `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`                               | `1095`  | Days after a timeline row's own instant before `reap:orders` unsets the free text staff wrote on it (an override's reason, a staff note). The row stays                                        |
| `NODE_ORDER_EXPORT_MAX_ROWS`                                         | `20000` | Most orders one `GET /orders/export` may carry. Over it: `422` `ORDER_EXPORT_TOO_LARGE`, before any byte of the file                                                                           |
| `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`, `NODE_ORDER_NOTE_RATE_LIMIT_MAX` | —       | Per-account budgets: see [the rate-limit budgets](../understand/security.md#the-rate-limit-budgets)                                                                                            |
| `NODE_ADMIN_ORDER_MAX_LINES`                                         | `100`   | Most lines an admin-created order (`POST /orders`) may carry. Over it: `422` `ORDER_LINE_LIMIT_EXCEEDED`. The contract's own ceiling is 1000; a larger value has no effect                     |
| `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`                                 | `99999` | Largest quantity on one line of an admin-created order. Same refusal. The contract's ceiling is 999999                                                                                         |
| `NODE_PURCHASE_HOLD_CANCEL_COUNT`                                    | `3`     | How many of a buyer's unpaid cancels inside the window pause their checkout, and paid ones flag the account ([the purchase hold](#the-purchase-hold)). Minimum 2                               |
| `NODE_PURCHASE_HOLD_WINDOW_DAYS`                                     | `7`     | How long a cancel counts toward it                                                                                                                                                             |

The VAT RATES charged against an order line are a different thing with a different owner — see
[products](./products.md#configuration); this module only freezes onto the order the rate `products`
hands it at checkout. Every getter asks its slice (`config.ts`) per call, and the slice parses once per process, so a
correction takes effect on restart.

## Libraries

`csv-stringify` is this module's alone, used by the [CSV export](#the-csv-export). See
[Package Dependencies](../reference/package-dependencies.md) for where it sits among everything else.

| Library                  | Maintained                            | What it costs you                                                                                      |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `csv-stringify` (chosen) | active, typed, MIT, zero dependencies | A Transform stream (so the file is never whole in memory) with `escape_formulas` built in              |
| a hand-rolled writer     | —                                     | quoting, delimiters and formula escaping are exactly the parsing `CLAUDE.md` rules out writing by hand |
| a spreadsheet library    | varies                                | binary formats, a larger tree and no stream: the file would be built in memory                         |

## Read next

- [Creating an order, exports and mails](./orders-creation-and-exports.md) — a deeper page of this module
- [Order status and timeline](./orders-status-and-timeline.md) — a deeper page of this module
- [Withdrawal window, purchase hold and shop identity](./orders-withdrawal-and-hold.md) — a deeper page of this module
- [Modules overview](./start.md) — the whole context map
- [`inventory`](./inventory.md) — where the units actually move
- [`payments`](./payments.md) — the money half of the same transition
- [Tactical DDD](../understand/tactical-ddd.md) — why this is the aggregate candidate
- [Events & Logging](../understand/events-and-logging.md) — `order.canceled` and `inventory.reservation_expired`
