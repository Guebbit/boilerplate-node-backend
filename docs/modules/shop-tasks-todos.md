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

| Kind                    | Opens on                                                                                                                                         | Cleared by                                                                                                                                                                              | Due (`dueAt`)                                                                                          | Route set (`routeSet`) | Told                      | `work` screen                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------- | ------------------------------ |
| `manual_refund_owed`    | `payment.refund_owed_by_hand`                                                                                                                    | `payment.refunded`, `payment.refund_canceled`                                                                                                                                           | + `NODE_PAYMENT_ATTENTION_MINUTES`                                                                     | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_refused`        | `payment.refund_failed` with `final: true` (a `disputed` failure opens one only when no dispute is open: otherwise the dispute to-do carries it) | `payment.refunded`, `payment.refund_canceled`                                                                                                                                           | the legal 14 days for a return refund (`refundLegalDueAt`), else + the attention window from now       | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `refund_reversed`       | `payment.refund_reversed` (a `disputed` one opens one only when no dispute is open)                                                              | `payment.refunded` (mark returned), `payment.refund_canceled`                                                                                                                           | the legal 14 days for a return refund, which may already be past; else + the attention window from now | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `amount_mismatch`       | `payment.amount_mismatch`                                                                                                                        | **never**: staff close it once they know why                                                                                                                                            | + the attention window                                                                                 | `AuditDisplay`         | admin only                | `orders/<orderId>`             |
| `dispute`               | `payment.dispute_opened` / `_updated` while it needs the shop's proof (`needs_response`)                                                         | the dispute leaves `needs_response`: proof sent, or decided early                                                                                                                       | the provider's `evidenceDueBy`                                                                         | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `dispute_awaiting_bank` | `payment.dispute_updated` with `under_review`: proof sent, the bank decides                                                                      | a decided or closed dispute (`won`, `lost`, `accepted`, `closed`); the closing note names it, and for a lost or accepted chargeback in another currency tells staff to check the amount | opening + 75 days, the card networks' usual outer limit (`AWAITING_BANK_MS`)                           | `PaymentRefunding`     | moderator, admin          | `sales/payments?tab=attention` |
| `paid_without_hold`     | `inventory.hold_orphaned` (the payment step only)                                                                                                | `order.canceled`, `shipment.shipped`                                                                                                                                                    | +4 h                                                                                                   | `InventoryManagement`  | warehouse, admin          | `orders/<orderId>`             |
| `consent_due`           | `fulfillment_order.delayed`, see below                                                                                                           | `shipment.shipped`, `fulfillment_order.canceled`                                                                                                                                        | `agreedAt` + 30 d, or the date the buyer holds                                                         | `OrderEditing`         | manager, moderator, admin | `orders/<orderId>`             |

**A refund the bank sends back.** A settled refund can come back weeks later (a closed card), and
the shop owes the money again. `payment.refund_reversed` opens a `refund_reversed` to-do, "Refund
sent back by the bank": agree a way with the buyer, pay, then mark the refund returned (which
closes it). It is mailed on opening and gets a due-soon reminder like any other to-do with time
left. Its date is the legal one only when the law sets one (a return refund's stamped legal deadline, which may
already be past: then the opened and overdue mails both go, truthfully), never the refund's
creation date.
The `refund_refused` and `refund_reversed` to-dos say the rule beside the date: "Legal refund
deadline (withdrawal): 2026-03-15" (a day on the shop's calendar), or "(faulty item): refund now".

**A dispute is two to-dos.** `dispute` is the proof the shop owes; when the proof is sent
(`under_review`) it is closed with the note "Proof sent; the bank is deciding" and one
`dispute_awaiting_bank` opens, a wait with nothing to do unless the bank runs late. Opening it is
the bell's alone (no mail), it gets no due-soon reminder, and past its 75 days the normal overdue
notice goes out. A decision closes whichever is open, naming the outcome. A redelivered event opens
nothing twice, and a dispute decided straight from `needs_response` never opens the waiting one.

The kinds, link types (`order`, `payment`, `refund`, `fulfillment_order`) and categories (`order`,
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
