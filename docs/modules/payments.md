# payments

::: tip At a glance
**Owns** — an order's money, behind a provider port. The intent freezes a total; the confirm moves the order to `paid`.
**Depends on** — [`orders`](./orders.md), [`inventory`](./inventory.md), [`users`](./users.md).
**Breaks if you change** — the confirm path. It is the single moment held units become a sale.
:::

## Its neighbourhood

<!-- module-graph:payments:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    payments["payments<br/><i>this module</i>"]
    cart["cart"]
    inventory["inventory"]
    invoicing["invoicing"]
    orders["orders"]
    returns["returns"]
    users["users"]

    cart --> payments
    invoicing --> payments
    returns --> payments
    payments --> inventory
    payments --> orders
    payments --> users
    orders -. "order.cancelled" .-> payments
    orders -. "order.refund_owed" .-> payments
    payments -. "payment.refunded" .-> invoicing
    payments -. "payment.refunded" .-> returns

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,orders core;
    class inventory,invoicing,returns supporting;
    class users generic;
    class payments centre;
```

<!-- module-graph:payments:end -->

## The story

A payment is _about_ an order: the intent freezes its total, the confirm moves its status to
`paid`. The arrow never comes back — [`orders`](./orders.md) announces `order.refund_owed` and this
module answers with the refund. Split from `order.cancelled` itself (B6): retrying the refund must
never re-deliver the customer-facing cancellation webhook every time a provider outage outlasts one
sweep pass.

This module also listens to `order.cancelled` itself, but for a different reason: closing a card
intent nobody ever finished (E17), so an abandoned one cannot resolve at the provider days later
with no local row left to catch the charge it makes. Best-effort, and unrelated to the refund —
a payment already `succeeded` is `order.refund_owed`'s to give back, never this listener's to close.

**`settlePayment` is the one place where the money and the goods agree.** It commits the order's
held units itself rather than announcing and hoping, because that instant is the only moment a hold
becomes a sale. Without this module nothing would ever commit a hold, and every order would sit
reserved until its window expired.

It is reached three ways — the confirm, the sync, and the provider's webhook — and there is exactly
one of it because two would drift, and drifted copies commit the hold twice. Every write inside it
is conditional on the payment still being settleable, and the two terminal statuses are deliberately
outside that set: that absence is what makes a provider retrying a delivery for three days find
nothing left to move.

::: tip The provider is a port, and the implementation is fake on purpose
Nothing above `providers/` knows which processor is wired in. The fake is what lets the whole
checkout-to-paid path run in tests and in the demo profile without a sandbox account — including
the 3-D Secure challenge and the webhook, which it imposes exactly as a real provider would.
Swapping in a real processor is one file behind an interface that already exists.
:::

::: warning The card never reaches this server
`POST /payments/{id}/confirm` takes an opaque method reference the browser's provider widget
produced, never a card number. That is what keeps the deployment in the light PCI DSS bracket
rather than the heavy one, and it is why the request schema refuses a value shaped like a PAN.
:::

## The answer is not always immediate

Two statuses sit between submitted and settled, and a lifecycle without them loses every European
card payment the bank decides to challenge:

| Status            | What it means                                                                |
| ----------------- | ---------------------------------------------------------------------------- |
| `requires_action` | The bank wants a 3-D Secure challenge answered in the browser.               |
| `processing`      | The provider has the payment but has not settled it. Some methods take days. |

Both answer **200**, not an error: the browser has a next step, and a 4xx would tell it to stop.
`POST /payments/{id}/sync` re-reads the provider and settles, which is what makes the happy path
feel synchronous.

**`processing` also extends the order's stock hold**, to `NODE_BANK_TRANSFER_HOLD_HOURS` from that
moment (B3) — a SEPA debit or a bank redirect can take days, and the ordinary 30-minute window
would let [`inventory`](./inventory-reservations.md)'s reservation sweep cancel an order whose
money is still on its way. `requires_action` gets no such grace: it means the browser has a
challenge to answer, not the provider a payment to finish.

**`POST /payments/webhook` is the authority**, and the browser never is. It arrives whether or not
the customer kept the tab open, and it is the one route in the module mounted above the auth wall:
its caller is a machine with no account, authenticating by signing the raw body — a stronger proof
of origin than any cookie this API could ask it for. Deliveries are deduplicated by event id,
because a provider retries for days and the inventory commit is not conditional on anything else.

The dependency on [`users`](./users.md) is groundwork rather than a current feature. The order
already carries a `userId`; resolving it against the account record is what makes the id on a
payment document worth querying later, when "everything this account has paid" becomes a screen.
An unresolvable payer is logged rather than refused.

`unique: true` on `orderId` is the guard against a double charge: one payment per order is a
database fact, not a check somebody has to remember.

Delete this module and cancelling an order still releases its stock but returns no money — the
cancel lifecycle itself (`statusesLeadingTo`, `domain/lifecycle.ts`) has no idea this module exists.

## The pre-check, and the final write

Two different questions, asked at two different moments, both owned by `orders`:

- **The pre-check** — `orders.isPayable(order.status)` — gates every door that could open a new
  payment: `POST /payments/intent`, `POST /payments/order/{orderId}/offline`, and `getForOrder`'s
  `PaymentActions.pay`. `pending` only; a `paid` order answers `false` even though `system` may
  still write a `paid → paid` echo underneath it (the payment webhook's own retries) — that echo is
  not a fresh offer to pay. This module never compares a status literal to decide whether to open a
  door; it always asks `orders`, so it cannot drift off the rule the lifecycle owns.
- **The final write** — `orderService.markPaid` — is what actually moves the order once money has
  settled (`settlePayment` calls it; see "Status transitions" below and
  `docs/theory/tactical-ddd.md` §1 "Who writes the status"). It is `orders`' own conditional write,
  independent of the pre-check: a race that slips past the pre-check still cannot double-move the
  order, because `markPaid` only writes from `pending`.

**After the final write, the order is read again.** `markPaid` and the payment's own
`succeeded` write are two writes, and a customer may cancel from `paid` in between — that cancel's
refund then finds nothing `succeeded` to return. So `settlePayment` decides "keep the money, or
put it straight back" on the order's status as read _after_ its own payment write, never on the
copy `markPaid` answered. Either the cancel's refund sees `succeeded`, or this re-read sees
`cancelled`; the conditional `succeeded → refunded` write makes sure only one of them refunds.

## Pending effects

The `succeeded` write, the stock commit and clearing the marker that says which is still owed are
three separate steps, and only the first is durable on its own. `settlePayment` sets
`pendingEffects: ['commit']` in the SAME write that moves the payment to `succeeded`, then commits
the order's held stock (`inventoryService.commitForOrder`) and clears the marker — on both the
happy path and the "order lost" refund path.

A crash between the status write and the clear (a dead process, a database hiccup on the order
read, the commit itself, or the order-lost branch's own refund) leaves a payment reading
`succeeded` with nothing set aside for its order. Unlike a webhook, nothing redelivers a settlement
that already answered its caller — so `npm run sweep:payment-effects`
(`payments/services/effects.ts#retryPendingEffects`, every 5 minutes, see
`docs/reference/ops.md#scheduled-jobs`) is the only thing that ever retries it. For any order still
expecting one, it repeats the commit — safe, since claiming a hold is exactly-once; for one that
has moved on instead (cancelled before the crash could even decide that), it marks the refund owed
— `orders`' own `NODE_ORDER_EFFECT_RETRY_MINUTES` sweep is what actually returns the money — and
either way clears this marker once its own decision is made. It leaves the marker standing on
anything younger than `NODE_PAYMENT_EFFECT_RETRY_MINUTES` (default 1 minute), so it never races a
settlement still mid-flight.

The marker also owes the announcement. `payment.succeeded` is written to the
[transactional outbox](../tools/outbox.md) in the same transaction that clears the marker
(`src/modules/payments/services/announce.ts`), so a settlement that died after charging still announces: the sweep
commits the stock, writes the row, and the relay publishes it. Nothing is announced for an order
that was lost — the refund path owns that.

`pendingEffects` is internal bookkeeping, omitted from the wire the same way `providerRef` is.

## Status transitions

`requires_confirmation` is entered once, by `POST /payments/intent`, and never again — nothing a
provider reports is ever that value. From there, every non-terminal status can settle to any other
non-terminal status: `CONFIRMABLE_PAYMENT_STATUSES` (`service.ts`) gates which ones `POST
/payments/{id}/confirm` accepts as a starting point (`requires_confirmation`, `declined` — a
decline is retryable with another method), and `SETTLEABLE_PAYMENT_STATUSES` gates which ones
`settlePayment` will still write over (everything except the two terminal states below). `succeeded`
moves to `refunded` and nowhere else — and only once the refund records add up to `amount`
([Refund records](#refund-records)); `refunded` moves nowhere.

```mermaid
stateDiagram-v2
    [*] --> requires_confirmation: POST /payments/intent
    requires_confirmation --> requires_action: confirm
    requires_confirmation --> processing: confirm
    requires_confirmation --> succeeded: confirm
    requires_confirmation --> declined: confirm
    requires_action --> requires_action: sync — still waiting
    requires_action --> processing: sync
    requires_action --> succeeded: sync
    requires_action --> declined: sync
    processing --> processing: sync — still waiting
    processing --> succeeded: sync
    processing --> declined: sync
    declined --> requires_action: confirm, retried
    declined --> processing: confirm, retried
    declined --> succeeded: confirm, retried
    declined --> declined: confirm, refused again
    requires_confirmation --> succeeded: recorded by hand
    declined --> succeeded: recorded by hand
    succeeded --> refunded: the refunds add up to the amount paid
    succeeded --> succeeded: a partial refund
    refunded --> [*]
```

`POST /payments/order/{orderId}/offline` (below) is a fourth way to reach `succeeded`, alongside
confirm, sync and the webhook — it calls the exact same `settlePayment`, so nothing about this
diagram's terminal states or their guards changes for it.

## Offline payments

Not every payment goes through the provider: an admin can record money that arrived some other
way — cash at the counter, a phone order paid by bank transfer — on a still-`pending` order.

```mermaid
sequenceDiagram
    actor Admin
    participant API as POST /payments/order/:orderId/offline
    participant Pay as payments
    participant Set as settlePayment
    Admin->>API: method, reference?, receivedAt?
    API->>Pay: order pending? no card charge in flight?
    Pay->>Pay: upsert payment — provider "manual"
    Pay->>Set: state { status: succeeded }
    Set->>Set: order pending → paid (system)
    Set-->>Admin: 201 payment
```

**The admin records a payment; `settlePayment` moves the order.** Same code path as a card, so the
stock commits, `ORDER_STATUS_CHANGED` and `PAYMENT_SUCCEEDED` fire, and webhooks and emails follow
exactly as they would for a card. `manual` is not a provider port implementation — the port is
card-shaped, and a `manual` adapter would be three methods that throw — the offline path instead
writes the row directly and calls `settlePayment`.

The amount is always the order's own total; a partial or over-payment is out of scope, handled by
hand and off-system. Recording is refused with `PAYMENT_ORDER_NOT_PAYABLE` once the order is no
longer `pending` (including a second attempt at the same order), and with `PAYMENT_IN_FLIGHT` while
a card charge on the same order is still `requires_action` or `processing` — the provider could
still land that charge on its own, and recording money too would risk charging twice. A card
attempt that never got that far (`requires_confirmation`, `declined`) is simply overwritten: the row
becomes the offline one.

**Only an operator can say a `manual` refund actually happened.** There is no provider to ask, so
money that left the system by hand can only be confirmed returned by a person: the automatic
listener (a customer's own cancel) leaves the payment `succeeded` and writes an unattended
`payment.refund_owed_by_hand` audit row instead of guessing; `refundByOrder` — already admin-only,
with the same fresh-session tier as recording one — is the only door that may set
`refundedByHand: true` (B1b). A cancelled hand-paid order therefore shows `succeeded` until an
operator confirms it, not "refunded" for money nobody actually moved.

<a id="refund-records"></a>

### Refund records

A refund is a row on the payment (`refunds[]`), one per attempt — Stripe's `Refund` shape — and
`amountRefunded` is the running total, counting a refund from the moment it is opened.

```mermaid
sequenceDiagram
    participant C as caller (operator / cancel listener)
    participant P as payments
    participant D as database
    participant V as provider
    C->>P: refund(orderId, amount?)
    P->>D: settle any refund still open (same idempotency key)
    P->>D: open a record + raise amountRefunded (conditional on the value read)
    P->>V: refund(part, idempotencyKey)
    alt provider answers
        P->>D: record succeeded (conditional on it still being open)
        P->>D: payment refunded, only if the records add up to amount
        P-->>C: payment.refunded (once per refund)
    else provider refuses
        P->>D: record failed + lastError, still counted
        P-->>C: error — the sweep retries the same record
    end
```

- **Opened before asked.** The write that appends the record also raises `amountRefunded`, and it is
  conditional on `amountRefunded` still being what the caller read — so two racing partial refunds
  cannot return more than was paid. A miss re-reads and re-checks.
- **Exact sums.** Amounts are summed in integer minor units (`toMinorUnits`/`toDecimalAmount` from
  `orders`), never by adding decimals.
- **One key per record.** `refund:{paymentId}:{refundId}` — a retry of a refund is safe at the
  provider, and two different partial refunds are never mistaken for one.
- **A refusal stays open.** The record is `failed` (its `lastError` is stored, never published) and
  keeps its share of `amountRefunded`, so nothing is opened beside it. `retryOpenRefunds` (run by
  `npm run sweep:payment-effects`) and the next cancel or operator call both finish it.
- **The default is everything left.** `POST /payments/order/{orderId}/refund` with no body returns
  all that is still refundable; with an `amount` it returns that part. More than what is left is a
  422 (`PAYMENT_REFUND_EXCEEDS_REMAINING`); nothing left is a 409.
- **A refund can pay for a return.** `refundForReturn` (called by [`returns`](./returns.md) when goods
  are received) opens a refund with `reason: return` and the return's `returnId`, clamped to what the
  payment has left. `payment.refunded` carries the `returnId`, so `returns` closes the return when
  the refund lands — including later, when the sweep completes one the provider first refused.
- **A credit note per refund.** `payment.refunded` carries `refundId`, this refund's `amount` and
  `full`; `invoicing` issues from it ([`invoicing`](./invoicing.md)).

Every other refund dispatches to the provider named on the payment's own `provider` field — never
the deployment's currently configured one (B1c) — so a refund of an older payment still reaches the
provider that actually took the money even after a deployment switches to another. The provider is
asked BEFORE the status moves (B1): a rejection leaves the payment `succeeded`, so the retry sweep
(`ORDER_REFUND_OWED`, above) can actually retry it, instead of a failed attempt being recorded as a
successful one.

Requires `payments.any.create`, the same fresh-session tier as a refund (`payments.any.update`) — an
admin's own word that money arrived is exactly as consequential as one that it left.

The webhook is not on this diagram because it does not add an edge the diagram doesn't already
have — it reaches the exact same `settlePayment` a sync does, with `succeeded` or `declined` as the
only two states it ever reports.

## Bank transfer

At checkout the customer may choose `bank_transfer` instead of `card` — `GET /payments/methods`
says whether this deployment offers it at all, which is only once `NODE_BANK_TRANSFER_BENEFICIARY`
and `_IBAN` are both set.

```mermaid
stateDiagram-v2
    [*] --> pending: checkout, paymentMethod = bank_transfer<br/>hold until payBy
    pending --> paid: admin records the transfer<br/>POST /payments/order/:orderId/offline
    pending --> paid: customer pays by card instead
    pending --> cancelled: customer cancels
    pending --> cancelled: sweep — payBy passed, no money
    paid --> [*]
    cancelled --> [*]
```

- **The order carries the chosen method as a preference, not a lock.** The card form stays offered
  regardless, and a card payment settles through the ordinary pipeline above. When a card pays a
  transfer order the order's `paymentMethod` becomes `card`, so the order page agrees with its
  payment; money recorded by hand leaves it alone.
- **The hold is longer, and the sweep needs no change to know it.** `cart`'s checkout hands
  `inventoryService.reserveForOrder` an explicit window — `NODE_BANK_TRANSFER_HOLD_HOURS` (default
  168, a week) instead of `NODE_RESERVATION_TTL_MINUTES` — and the same reservation sweep that
  releases a 30-minute card hold releases this one too, since it only ever reads each hold's own
  stored `expiresAt`. See [Inventory Reservations](./inventory-reservations.md#the-sweep).
- **A week-long hold is free to take, so an account is capped.** `NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT`
  (default 2) counts that account's own `pending` transfer orders; a third checkout is refused with
  `CART_BANK_TRANSFER_LIMIT` before anything is written.
- **`transferInstructions` is computed at read time, never frozen onto the order — except its own
  `reference`.** The beneficiary/IBAN/BIC are deployment config, not order-specific data, so every
  response recomputes them from the current environment — a later correction to a typo'd IBAN
  shows up on every still-`pending` transfer order, not just new ones. `reference` is the one
  exception: the RF code checkout minted for THIS order, stored once on `transferReference` and
  never recomputed. Present only while `paymentMethod` is `bank_transfer` and `status` is
  `pending`. See [Matching a transfer back to its order](#matching-a-transfer-back-to-its-order).
- **`orders` owns the bank-transfer business rules outright**, `transferInstructions` and the
  open-transfer cap alike — the reference-minting and open-transfer-cap config that used to sit in
  `infrastructure` to dodge a cycle now lives in `orders/config.ts`, since `orders` is the entity
  both rules constrain. `payments` and `cart` read it through `orders`' own barrel; `payments`
  keeps the `ibantools` validation, the one thing that stays genuinely its own. See
  [Libraries a module owns](../theory/modules.md#libraries-a-module-owns).
- **Two emails, and a card timeout gets neither.** Checkout sends the instructions and the deadline
  instead of the ordinary confirmation — there is nothing to confirm yet. The sweep's own expiry
  sends a second one, but only when `paymentMethod` is `bank_transfer`: a card hold is thirty
  minutes, over before anyone could have opened a confirmation email, so a card timeout stays
  silent exactly as it does today.

## Matching a transfer back to its order

The bank never tells this app anything — there is no statement feed, no webhook, no polling.
Instead checkout gives the customer a clean code to write into the transfer, and an admin reads it
back off the bank's own website:

```mermaid
flowchart LR
    C["Customer pays, writes the code<br/>RF18 5390 0754 in the transfer"] --> B["Bank website<br/>shows the incoming transfer"]
    B --> A["Admin reads the code,<br/>pastes it into the app"]
    A --> L["GET /payments/order-by-reference<br/>finds the order"]
    L --> P["POST .../offline<br/>marks it paid — settlePayment, as usual"]
```

- **The reference is an ISO 11649 "RF" creditor reference** — the standard SEPA reference field,
  e.g. `RF13 2EY8 H44V JAVZ KX80 JRL`. Its mod-97 check digits (ISO 7064 MOD 97-10, the same scheme
  IBAN itself uses) mean a mistyped code is REJECTED rather than silently matching the wrong order.
  `orders/domain/transfer-reference.ts`'s `buildReference` mints it as part of writing the order,
  from the order's own id encoded as base-36 — lossless over every bit of the id, so two different
  orders can never mint the same code the way a hash could, which is what makes
  `transferReference`'s unique index a true invariant rather than a rarely-firing safety net.
  `payments`' lookup endpoint imports `parseReference` from the same file.
- **Minted once, in the same write that creates the order, never recomputed.** `orders`' `placeOrder`
  mints it atomically as part of the write — see `OrderDocument.transferReference`'s own comment.
  Absent on a `card` order, and on a `bank_transfer` order that predates this field — such an order
  is simply not reachable through this lookup; an admin finds it by id through the normal order
  search instead. No backward-compatible raw-id fallback: on a boilerplate there are ~zero pending
  transfer orders old enough to need one, and CLAUDE.md's scope rule says not to keep one anyway.
- **No new settlement code.** The admin screen calls the lookup, then the existing `POST
/payments/order/{orderId}/offline` — the same `pending → paid` move, stock commit, and events any
  other offline record already goes through.
- **A malformed and an unmatched reference answer the same 404.** Distinguishing them would tell a
  guesser which half of a code they got right.

## Libraries

`ibantools` is this module's alone — see [Package Dependencies](../tools/package-dependencies.md)
for where it sits among everything else this repo depends on. Used once, at boot: it is what
the `paymentsConfig` boot check runs `NODE_BANK_TRANSFER_IBAN`/`_BIC` through before the deployment is allowed to
advertise `bank_transfer` at all.

| Library                      | Maintained    | What it costs you                                                              |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `ibantools` (chosen)         | active, typed | IBAN + BIC validation and formatting for every SEPA country, zero dependencies |
| a hand-rolled mod-97 check   | —             | exactly the kind of validation `CLAUDE.md` rules out writing by hand           |
| trusting the value unchecked | —             | a mistyped IBAN in `.env` sends every customer's money to the wrong account    |

The RF reference above is ALSO a hand-rolled mod-97 check, and is not a contradiction of the row
just above: `ibantools` validates IBAN and BIC only, has no ISO 11649 support at all, and no
maintained package on npm covers this narrow a spec — the "only then write it ourselves" branch of
`CLAUDE.md`'s own dependency rule, not the one the IBAN row warns against skipping.

## The pipeline

Three entry points, one settlement. What differs between them is only how the provider was asked.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["create intent"] --> B["total frozen<br/><i>unique on orderId — one payment per order</i>"]
    B --> C["confirm<br/><i>method reference, never a card</i>"]
    C --> D{"the provider port<br/><i>fake · stripe</i>"}
    D -.->|"requires_action<br/>processing"| S["browser finishes<br/><i>POST /:id/sync</i>"]
    W["provider webhook<br/><i>the authority</i>"] --> ST
    S --> ST["settlePayment<br/><i>the only place money is reconciled</i>"]
    D -->|"succeeded / declined"| ST
    ST -.->|declined| E["order stays pending<br/><i>units still held</i>"]
    ST -->|succeeded| F["order → paid<br/><i>orders</i>"]
    F --> G["commit the hold<br/><i>inventory</i>"]
    OC["orders"] -. "order.refund_owed" .-> R["refund<br/><i>if one was due</i>"]

    classDef step fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef port fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#111827;
    class A,B,C,OC,S,W step;
    class D,ST port;
    class F,G,R done;
    class E bad;
```

## Configuration

| Variable                                  | Default | Meaning                                                                                                                                                                                            |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_PAYMENT_PROVIDER`                   | —       | Which registered implementation answers. Unset: no card payments (`card` is not listed). A name this process does not carry throws at boot rather than silently taking no payments                 |
| `NODE_PAYMENT_WEBHOOK_SECRET`             | —       | What `POST /payments/webhook` verifies deliveries against. With a live provider this is THEIR signing secret, and it is the only thing between an attacker and marking any order paid              |
| `NODE_DEFAULT_CURRENCY`                   | `EUR`   | ISO-4217. Stamped on every payment document at creation; also what `products`, `cart` and `orders` (frozen at checkout) read for their own `currency` field — one shop, one currency               |
| `NODE_PAYMENT_ABANDONED_RETENTION_DAYS`   | `30`    | Days an attempt that never settled may sit untouched before `npm run reap:payments` deletes it. See Retention below.                                                                               |
| `NODE_BANK_TRANSFER_BENEFICIARY`          | —       | The account name a transfer is made out to. `bank_transfer` is offered only once this and `_IBAN` are both set                                                                                     |
| `NODE_BANK_TRANSFER_IBAN`                 | —       | The account IBAN. Validated with `ibantools` at boot — a malformed value refuses to boot rather than silently advertising a dead account                                                           |
| `NODE_BANK_TRANSFER_BIC`                  | —       | The account's BIC/SWIFT, optional even once transfer is offered. Validated at boot when set                                                                                                        |
| `NODE_BANK_TRANSFER_HOLD_HOURS`           | `168`   | How long checkout holds stock for a `bank_transfer` order — a week, not `NODE_RESERVATION_TTL_MINUTES`'s thirty minutes                                                                            |
| `NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT` | `2`     | How many `pending` transfer orders one account may have at once, before checkout refuses a new one                                                                                                 |
| `NODE_PAYMENT_EFFECT_RETRY_MINUTES`       | `1`     | How old a `pendingEffects` marker must be before `sweep:payment-effects` retries it. See [Pending effects](#pending-effects)                                                                       |
| `NODE_STRIPE_SECRET_KEY`                  | —       | Only checked at boot, outside development/test (staging included): refuses to start on a `sk_test_` key, since a real deployment silently running test-mode payments is worse than failing to boot |

The currency is stamped rather than looked up, so changing it affects new payments and leaves
existing ones reading in the currency they were actually taken in. There is no conversion
anywhere in this module: a deployment that needs several currencies needs a price per currency
on the product, not a rate here.

Two more, not environment variables — code constants in `providers/webhook-signature.ts` and
`model.ts`, called out here because an operator debugging a webhook has no other reason to open
either file:

| Constant                       | Value | Meaning                                                                                                                                                                                   |
| ------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOLERANCE_SECONDS`            | 300   | How far a delivery's `t=` may drift from the server's clock before it is rejected as stale.                                                                                               |
| `WEBHOOK_EVENT_RETENTION_DAYS` | 30    | How long a processed event id is remembered before its ledger row expires — chosen to sit past any provider's retry window, a claim about a third party this deployment does not control. |

## Retention

Two questions came up here, and both have a real answer worth writing down rather than leaving
implicit in the code.

**Is anything on a payment personal data (PII) that must eventually be scrubbed, the way
[`orders`](./orders.md) scrubs a shipping name and address?** No. `cardLast4` is four digits out
of a card number — not a PAN, and not enough to identify anyone or charge anything on its own,
the same reasoning that lets it appear on any receipt or bank statement. `amount`, `currency` and
`provider` were never personal data either. The only personal link on a payment is `userId`, and
that is already removed the moment an account is erased (`detachUserId`, immediate — no delay, no
timer). So once a payment settles, there is nothing left for a retention job to do.

**Does a settled payment ever get deleted?** No — same as `orders`, a `succeeded` or `refunded`
payment is an invoice, kept indefinitely for tax and commercial-law reasons. Neither status is
ever a candidate for `reap:payments`, `reap:orders`, or any other timer in this codebase.

**What about a payment that never settles at all** — a declined card nobody retried, a 3-D Secure
challenge nobody answered? That row was never a transaction: no money moved, so there is no
invoice to keep. `npm run reap:payments` deletes it once it has sat untouched (`updatedAt`) for
`NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (default 30 days) — an abandoned checkout, not a financial
record. Retrying resets the clock, the same way editing a cart resets `carts`' own TTL.

| Payment state                            | Kept forever? | Mechanism                                      |
| ---------------------------------------- | :-----------: | ---------------------------------------------- |
| `succeeded` / `refunded`                 |      Yes      | Never touched by any timer — it is the invoice |
| Anything else, untouched past the window |      No       | `npm run reap:payments` deletes the row        |

`npm run reap:payments` runs nightly from `docker/crontab`, alongside the rest of this repo's
scheduled jobs — see [Scheduled jobs](../reference/ops.md#scheduled-jobs) for the full mechanism
and the module-removal convention that goes with owning one.

This is a genuinely different shape from `orders`' retention: `orders` keeps every row forever and
scrubs PII in place; `payments` keeps a settled row forever and deletes an unsettled one outright.
Neither scrubs a settled payment, because there is nothing on it left to scrub.

## Related pages

- [The provider port](./payments-provider-port.md) — the interface and the fake behind it
- [`orders`](./orders.md) — what a payment is about
- [`inventory`](./inventory.md) — the units this module commits
- [Layers](../theory/layers.md) — what a port is and where it sits
- [Security](../tools/security.md) — what is never stored here, and this module's own rate-limit budgets
