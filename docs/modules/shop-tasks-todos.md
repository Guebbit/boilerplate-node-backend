---
type: concept
audience: [developer]
---

# Shop to-dos by situation

The to-do each payment, stock or delivery situation opens, and what closes it.

## The shop's to-dos {#the-shop-s-to-dos}

One task per situation, opened by the event that starts it and cleared by the event that ends it.
The dedup, the replay rules and the overdue sweep are the engine's: see
[System tasks](./tasks.md#system-tasks).

| Kind                    | Opens on                                                                                                                                            | Cleared by                                                                                   | Due (`dueAt`)                                                                                          | Route set (`routeSet`) | Told                      | `work` screen                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------- | ------------------------------ |
| `manual_refund_owed`    | `payment.refund_owed_by_hand`                                                                                                                       | `payment.refunded`, `payment.refund_canceled`                                                | + `NODE_PAYMENT_ATTENTION_MINUTES`                                                                     | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_refused`        | `payment.refund_failed` with `final: true` (a `disputed` failure opens nothing: the dispute to-do carries it)                                       | `payment.refunded`, `payment.refund_canceled`                                                | the legal 14 days for a return refund (`refundLegalDueAt`), else + the attention window from now       | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_reversed`       | `payment.refund_reversed` (a `disputed` one opens nothing: the dispute to-do carries it)                                                            | `payment.refunded` (mark returned), `payment.refund_canceled`                                | the legal 14 days for a return refund, which may already be past; else + the attention window from now | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `amount_mismatch`       | `payment.amount_mismatch`                                                                                                                           | **never**: staff close it once they know why                                                 | + the attention window                                                                                 | `AuditDisplay`         | admin only                | `orders/<orderId>`             |
| `refund_unrecorded`     | `payment.refund_unrecorded`: a refund made in the provider's dashboard that the import gave up on, or that is in another currency                   | **never**: staff close it after "Re-sync refunds", or once the refund is in their books      | + the attention window                                                                                 | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `return_refund_short`   | `payment.return_refund_short`: a return asked for money and the payment gave less, or nothing (a receipt, a proof of sending, a canceled remainder) | `return.closed_by_hand`; otherwise staff close it                                            | + the attention window                                                                                 | `ReturnReceiving`      | manager, warehouse, admin | `returns/<returnId>`           |
| `dispute`               | `payment.dispute_opened` / `_updated` while it needs the shop's proof (`needs_response`)                                                            | the dispute leaves `needs_response`: proof sent, or decided early                            | the provider's `evidenceDueBy`                                                                         | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `dispute_awaiting_bank` | `payment.dispute_updated` with `under_review`: proof sent, the bank decides                                                                         | a decided or closed dispute (`won`, `lost`, `accepted`, `closed`); the closing note names it | opening + 75 days, the card networks' usual outer limit (`AWAITING_BANK_MS`)                           | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `paid_without_hold`     | `inventory.hold_orphaned` (the payment step only)                                                                                                   | `order.canceled`, `shipment.shipped`                                                         | +4 h                                                                                                   | `InventoryManagement`  | warehouse, admin          | `orders/<orderId>`             |
| `consent_due`           | `fulfillment_order.delayed`, see below                                                                                                              | `shipment.shipped`, `fulfillment_order.canceled`                                             | `agreedAt` + 30 d, or the date the buyer holds                                                         | `OrderEditing`         | manager, moderator, admin | `orders/<orderId>`             |

**A refund the bank sends back.** A settled refund can come back weeks later (a closed card), and
the shop owes the money again. `payment.refund_reversed` opens a `refund_reversed` to-do, "Refund
sent back by the bank": agree a way with the buyer, pay, then mark the refund returned (which
closes it). It is mailed on opening and gets a due-soon reminder like any other to-do with time
left. Its date is the legal one only when the law sets one (a return refund's stamped legal deadline, which may
already be past: then the opened and overdue mails both go, truthfully), never the refund's
creation date.
The `refund_refused` and `refund_reversed` to-dos say the rule beside the date: "Legal refund
deadline (withdrawal): 2026-03-15" (a day on the shop's calendar), or "(faulty item): refund now".

**A refund the shop did not record.** A refund made in the provider's dashboard is imported by the
refund event. When the import loses its race on every attempt, or the refund is in another currency
than the payment (never converted), `payment.refund_unrecorded` opens a `refund_unrecorded` to-do on the
payment: "Re-sync refunds" on the payment runs the import again, and for another currency staff
record the refund themselves. Nothing closes it by event: a re-sync that works raises none, so staff
close it. The text names the refund's provider id, amount and currency, so the one open to-do
for a payment keeps the first it was opened with. A refund the import cannot record (another currency)
is announced again on every webhook or re-sync of that payment, so a closed to-do comes back while the
books still lack it.
See [Refunds made outside the app](./payments-refunds.md#refunds-made-outside-the-app).

**A return the payment could not pay in full.** Part of the payment can already be gone another way
(a goodwill refund, a refund made in the provider's dashboard, a lost chargeback). When a return asks
for money and `openReturnRefund` opens less than asked, or nothing, it writes
`payment.return_refund_short` in the return's own transaction, and `shop-tasks` opens a
`return_refund_short` to-do **linked to the return** (link type `return`, so two returns on one
order are two to-dos): "Return R of order O: 100.00 EUR was owed, 70.00 EUR could be sent". The
return keeps what it owes. Staff check whether the earlier money was for this return and pay any rest
outside the app.

- **Opened less than asked:** the record is sent and the return closes when it settles, as always.
  The to-do stays until staff close it, or until they press **Close return** on it.
- **Opened nothing:** a receipt, or the goods arriving after a proof of sending, leaves the return
  `received`: no "refunded" mail, no `return.closed`. **Close return** (`return.closed_by_hand`,
  internal) clears the to-do. A canceled remainder is born closed, so there is no return to close
  by hand: staff close that to-do themselves.
  Which staff hear it is the set that holds `receive:Return`, the key the hand close needs.
  See [Closing a return by hand](./returns-statuses-and-cancellation.md#closing-a-return-by-hand).

**A dispute is two to-dos.** `dispute` is the proof the shop owes; when the proof is sent
(`under_review`) it is closed with the note "Proof sent; the bank is deciding" and one
`dispute_awaiting_bank` opens, a wait with nothing to do unless the bank runs late. Opening it is
the bell's alone (no mail), it gets no due-soon reminder, and past its 75 days the normal overdue
notice goes out. A decision closes whichever is open, naming the outcome. A redelivered event opens
nothing twice, and a dispute decided straight from `needs_response` never opens the waiting one.

The kinds, link types (`order`, `payment`, `refund`, `fulfillment_order`, `return`) and categories (`order`,
`cancellation`, `return`, `payment`) are appended to the core's enums by
`openapi.tasks.yaml`. Admin alone closes an `amount_mismatch` and an accepted `consent_due`: the
other roles read the alert and open the screen, but only `TaskManagement` works a task. The route set
says who is told and who may see the task; to be **assigned** one a person needs it _and_
`update:Task`.

**The delay reminder (`consent_due`, 16 CFR 435.2).** The shop never asks the buyer and never
cancels; the task is the reminder that a person must, and by when. `delivery` keeps `promisedAt` on
the fulfillment order, the date the buyer holds now: it starts as `agreedAt`, a later date from a
notice replaces it, a "no date yet" notice removes it.

| Before this notice                    | Opens when                             | Due               |
| ------------------------------------- | -------------------------------------- | ----------------- |
| the buyer holds the date they ordered | no new date, or past `agreedAt` + 30 d | `agreedAt` + 30 d |
| the buyer holds a later date          | no new date, or past that date         | that date         |
| the buyer was told "no date yet"      | never: the earlier task stands         | —                 |

A repeated delay while the task is still open opens nothing new and keeps its earlier due date
([dedup](./tasks.md)).

The rule binds a shop in the United States or one of its territories (`FTC_JURISDICTIONS`: `US`,
`PR`, `GU`, `VI`, `AS`, `MP`, 16 CFR 435) for **every** destination, including a delay with no ship-to
country. A shop elsewhere owes it only to a buyer shipped to one of those places. The shop's country
is `NODE_LEGAL_COUNTRY`; there is no list to configure.

## Read next

- [shop-tasks](./shop-tasks.md) — the module's own page
