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

| Kind                    | Opens on                                                                                                                                                                                                                              | Cleared by                                                                                                                                                                                       | Due (`dueAt`)                                                                                          | Route set (`routeSet`) | Told                      | `work` screen                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------- | ------------------------------ |
| `manual_refund_owed`    | `payment.refund_owed_by_hand`                                                                                                                                                                                                         | `payment.refunded`, `payment.refund_canceled`                                                                                                                                                    | + `NODE_PAYMENT_ATTENTION_MINUTES`                                                                     | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_refused`        | `payment.refund_failed` with `final: true` (a `disputed` failure opens one only when no dispute is open: otherwise the dispute to-do carries it); `payment.refund_owed_after_dispute` for a refund a dispute held back, once it ended | `payment.refunded`, `payment.refund_canceled`; replaced when a later dispute changes the outcome (`payment.refund_owed_after_dispute`)                                                           | the legal 14 days for a return refund (`refundLegalDueAt`), else + the attention window from now       | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_reversed`       | `payment.refund_reversed` (a `disputed` one opens one only when no dispute is open); `payment.refund_owed_after_dispute` for a bounced refund a dispute held back                                                                     | `payment.refunded` (mark returned), `payment.refund_canceled`; replaced when a later dispute changes the outcome (`payment.refund_owed_after_dispute`)                                           | the legal 14 days for a return refund, which may already be past; else + the attention window from now | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `amount_mismatch`       | `payment.amount_mismatch`                                                                                                                                                                                                             | **never**: staff close it once they know why                                                                                                                                                     | + the attention window                                                                                 | `AuditDisplay`         | admin only                | `sales/payments`               |
| `refund_unrecorded`     | `payment.refund_unrecorded`: a refund made in the provider's dashboard that the import gave up on, or that is in another currency                                                                                                     | **never**: staff close it after "Re-sync refunds", or once the refund is in their books                                                                                                          | + the attention window                                                                                 | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `return_refund_short`   | `payment.return_refund_short`: a return asked for money and the payment gave less, or nothing (a receipt, a proof of sending, a canceled remainder)                                                                                   | `return.closed_by_hand`; otherwise staff close it                                                                                                                                                | + the attention window                                                                                 | `ReturnReceiving`      | manager, warehouse, admin | `returns/<returnId>`           |
| `dispute`               | `payment.dispute_opened` / `_updated` while it needs the shop's proof (`needs_response`)                                                                                                                                              | the dispute leaves `needs_response`: proof sent, or decided early                                                                                                                                | the provider's `evidenceDueBy`                                                                         | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `dispute_awaiting_bank` | `payment.dispute_updated` with `under_review`: proof sent, the bank decides                                                                                                                                                           | a decided or closed dispute (`won`, `lost`, `accepted`, `closed`); the closing note names it, and for money the bank kept in another currency than the payment's tells staff to check the amount | opening + 75 days, the card networks' usual outer limit (`AWAITING_BANK_MS`)                           | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `paid_without_hold`     | `inventory.hold_orphaned` (the payment step only)                                                                                                                                                                                     | `order.canceled`, `shipment.shipped`                                                                                                                                                             | +4 h                                                                                                   | `InventoryManagement`  | warehouse, admin          | `orders/<orderId>`             |
| `consent_due`           | `fulfillment_order.delayed`, see below                                                                                                                                                                                                | `shipment.shipped`, `fulfillment_order.canceled`                                                                                                                                                 | `agreedAt` + 30 d, or the date the buyer holds                                                         | `OrderEditing`         | manager, moderator, admin | `orders/<orderId>`             |

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
outside the app. The event carries a `cause`: `used_up` (the payment had less left, so "the rest already
went back another way") or `no_payment` (no succeeded payment stands behind the order, so "nothing was
sent").

- **Opened less than asked:** the record is sent and the return closes when it settles, as always.
  The to-do stays until staff close it, or until they press **Close return** on it.
- **Opened nothing:** a receipt, or the goods arriving after a proof of sending, leaves the return
  `received`: no "refunded" mail, no `return.closed`. **Close return** (`return.closed_by_hand`,
  internal) clears the to-do. A canceled remainder is born closed, so there is no return to close
  by hand: staff close that to-do themselves.
  Which staff hear it is the set that holds `receive:Return`, the key the hand close needs.
  See [Closing a return by hand](./returns-statuses-and-cancellation.md#closing-a-return-by-hand).

**A dispute ended and refunds waited on it.** A refund the bank's dispute refused (`disputed`) waits
while any dispute is open. When the last one ends, `payments` writes one
`payment.refund_owed_after_dispute` per refund still owed, in the transaction that records the end, and
`shop-tasks` opens the refund to-do from each (the key is the refund, so two refunds are two to-dos and a
redelivery opens none twice). The words lead with the outcome so staff do not pay twice: **the bank kept
the money** ("the buyer already has it: pay nothing again, mark the refund returned"), or **the shop
kept it** ("void the refund, then refund the buyer by card"; a refund the bank took back after it
settled is never voided, so it says "agree a way with the buyer, pay, then mark it returned"). **The bank kept the money** means ANY dispute on the payment kept some, not only the one that just ended;
the to-do then also says to check each dispute in the provider's dashboard. When
the bank kept money in another currency than the payment's, the to-do also tells staff to check the amount
in the provider's dashboard. Its date is the legal day only while that day is still ahead and sooner than
the attention window; otherwise the attention window, so it never starts overdue. Nothing is raised when
another dispute is still open, when no refund was refused as `disputed`, or when the refund settled or was
voided meanwhile. The rules (which refunds, how it ended, the other currency) are `payments`'; this module
only words them. See [Disputes](./payments-disputes-and-adapters.md#disputes).

**A won dispute after the refund was marked returned.** When the bank kept the money, staff mark the
refund returned without paying (the buyer already has it). If that dispute is later **won**, the bank takes
the money back from the buyer, so the refund is owed again. `payments` remembers on the refund which dispute
it was marked returned against, and on the flip to `won` writes one more `payment.refund_owed_after_dispute`
(`markedReturned`) for exactly those refunds. It opens a `refund_reversed` to-do: pay the buyer outside the
app, then close it. The refund is already settled, so nothing closes it by event, and there is no legal
clock to name.

**A later dispute changes the outcome.** The to-do a refund already has may say the opposite of the
truth by now: "the buyer has the money: mark it returned" after a late win, or "refund by card" after a
second dispute was lost. Every `payment.refund_owed_after_dispute` for a refund that is still refused
(not the `markedReturned` ones) is opened with the tasks engine's `replaceOpen`. If the open to-do's
words differ, it is closed (a system note says a dispute changed outcome, nothing about who has the
money) and the new one opens, in one transaction after the redelivery check. If the words are the same,
the open to-do is only touched, so staff keep it and its assignee. A redelivered event changes nothing,
so the replacement stays open. A lost dispute flipped to won also says "first lost, then won" in the
words (`followsFlip`). Nothing is raised when no refund is owed.

**A dispute is two to-dos.** `dispute` is the proof the shop owes; when the proof is sent
(`under_review`) it is closed with the note "Proof sent; the bank is deciding" and one
`dispute_awaiting_bank` opens, a wait with nothing to do unless the bank runs late. Opening it is
the bell's alone (no mail), it gets no due-soon reminder, and past its 75 days the normal overdue
notice goes out. A decision closes whichever is open, naming the outcome. Both are linked to the dispute (link type
`dispute`, the provider's id), not the payment, so two disputes on one payment keep a to-do each and the
first to end clears only its own. A redelivered event opens
nothing twice, and a dispute decided straight from `needs_response` never opens the waiting one.

The kinds, link types (`order`, `payment`, `refund`, `dispute`, `fulfillment_order`, `return`) and categories (`order`,
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
