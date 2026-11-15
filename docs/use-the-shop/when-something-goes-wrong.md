---
type: troubleshooting
audience: [staff, owner]
---

# When something goes wrong

**The shop handles the ordinary cases by itself. These are the odd ones, and they are yours.**

The shop does not guess in a case like these. It shows you what it knows, gives you a button or a note field, and leaves the decision to a person. Each entry has three parts: **what you see**, **what to do**, **whose job it is**.

| Group                     | Page                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Refunds and card disputes | [Refunds that need a person](./when-something-goes-wrong-refunds.md)                               |
| Returns                   | [Returns that need a person](./when-something-goes-wrong-returns.md)                               |
| Orders, stock and parcels | [Orders, stock and parcels that need a person](./when-something-goes-wrong-orders-and-delivery.md) |

| Something odd happened                                                 | Go to                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A refund is owed and the money must be paid back by hand               | [A refund owed by hand](./when-something-goes-wrong-refunds.md#refund-owed-by-hand)                    |
| The card refused to take a refund back                                 | [A card refund the card refused](./when-something-goes-wrong-refunds.md#card-refund-refused)           |
| The bank sent a refund back after the shop had marked it paid          | [A refund the bank sent back](./when-something-goes-wrong-refunds.md#refund-bounced)                   |
| A buyer asked their bank to take a card payment back (a dispute)       | [A card dispute](./when-something-goes-wrong-refunds.md#card-dispute)                                  |
| The buyer was asked how they want their money and has not answered     | [The buyer does not answer](./when-something-goes-wrong-refunds.md#buyer-silent)                       |
| A refund was also made in the provider's own dashboard                 | [Refunded in the dashboard as well](./when-something-goes-wrong-refunds.md#refund-covered-elsewhere)   |
| Two refunds were opened by mistake                                     | [Two refunds by mistake](./when-something-goes-wrong-refunds.md#two-refunds)                           |
| A return was received but its refund will never come the usual way     | [A return that cannot finish](./when-something-goes-wrong-returns.md#return-cannot-finish)             |
| A return was approved but the buyer never sent the goods               | [The buyer never sent it back](./when-something-goes-wrong-returns.md#buyer-never-sent-it)             |
| A return parcel was lost on its way back to the shop                   | [The return parcel was lost](./when-something-goes-wrong-returns.md#return-parcel-lost)                |
| A return for a faulty or wrong item needs a decision                   | [A faulty item: repair, replace, refund or reduce](./when-something-goes-wrong-returns.md#faulty-item) |
| Money arrived by bank transfer for an order that was already cancelled | [A transfer for a cancelled order](./when-something-goes-wrong-orders-and-delivery.md#late-transfer)   |
| The shelf holds fewer units than the orders promised                   | [Fewer on the shelf than promised](./when-something-goes-wrong-orders-and-delivery.md#fewer-on-shelf)  |
| An order stays in "being prepared" and nothing moves                   | [An order stuck in processing](./when-something-goes-wrong-orders-and-delivery.md#stuck-in-processing) |
| A parcel left a long time ago and nobody recorded its arrival          | [Shipped but not arrived](./when-something-goes-wrong-orders-and-delivery.md#shipped-not-arrived)      |
| A parcel was lost, or damaged on the way, and the buyer never got it   | [A parcel lost or damaged](./when-something-goes-wrong-orders-and-delivery.md#lost-parcel)             |
| A parcel was lost and the shelf has none left to send again            | [Lost, and none left](./when-something-goes-wrong-orders-and-delivery.md#lost-none-left)               |
| A parcel marked lost has arrived after all                             | [The lost parcel arrived](./when-something-goes-wrong-orders-and-delivery.md#lost-parcel-arrived)      |
| A parcel came back to the shop (returned to sender)                    | [It came back to us](./when-something-goes-wrong-orders-and-delivery.md#parcel-came-back)              |
| The server stopped while a refund, stock change or shipment was sent   | [After the server crashed](#after-server-crashed)                                                      |

## After the server crashed {#after-server-crashed}

**What you see.** A bell notice and a mail, "Check the result", naming an order (2026-000041) or a
product. A refund, a stock receipt, a stock adjustment or a shipment began and the shop never
learned how it ended: the server stopped, or was restarted, at that moment. A button you pressed
again then showed "we can't tell whether this went through". The shop did **not** run it a second
time, because that could move the money or the stock twice.

**What to do.** Look at what that screen shows now, and decide:

1. A refund: open the order's payment and read its refunds. One that is there succeeded: stop. None:
   it did not happen, refund again if you still mean to.
2. A stock receipt or adjustment: open the product's ledger and compare the last movements with
   what you entered. The counter is either already changed or not.
3. A shipment: open the order's shipments. A parcel that is there is real, so do not cut another.
4. Around the time of the crash, also look at refunds, stock receipts and adjustments, and shipments
   started then that nobody was told about: the shop only tells you about the ones somebody retried.
   A refund that was sent twice is the [two refunds by mistake](./when-something-goes-wrong-refunds.md#two-refunds) case.

Sending the same thing again always counts as a new action and takes a new key: that is your
decision, never the shop's.

**Whose job.** The people who hold the permission of that action: the moderator or the admin for
refunds, the warehouse for stock and shipments.
→ [Idempotency](../understand/idempotency.md#do-not-retry-operations)

## Still stuck

- [The shop manager](./manager.md) · [The warehouse](./warehouse.md) · [The support desk](./support.md) · [The moderator](./moderator.md): who owns each job.
