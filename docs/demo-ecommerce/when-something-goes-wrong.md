# When something goes wrong

**The shop handles the ordinary cases by itself. These are the odd ones, and they are yours.**

The shop does not guess in a case like these. It shows you what it knows, gives you a button or a
note field, and leaves the decision to a person. Each entry below has the same three parts:
**what you see**, **what to do**, **whose job it is**.

| Something odd happened                                                 | Go to                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| A refund is owed and the money must be paid back by hand               | [A refund owed by hand](#refund-owed-by-hand)                  |
| The card refused to take a refund back                                 | [A card refund the card refused](#card-refund-refused)         |
| A refund was also made in the provider's own dashboard                 | [Refunded in the dashboard as well](#refund-covered-elsewhere) |
| Two refunds were opened by mistake                                     | [Two refunds by mistake](#two-refunds)                         |
| Money arrived by bank transfer for an order that was already cancelled | [A transfer for a cancelled order](#late-transfer)             |
| The shelf holds fewer units than the orders promised                   | [Fewer on the shelf than promised](#fewer-on-shelf)            |
| An order stays in "being prepared" and nothing moves                   | [An order stuck in processing](#stuck-in-processing)           |
| A parcel left a long time ago and nobody recorded its arrival          | [Shipped but not arrived](#shipped-not-arrived)                |

::: tip More entries come with their features
Each entry here describes something the shop does today. When a new tool lands (disputes, a buyer
who never answers), its entry lands on this page in the same change as the tool.
:::

## A refund owed by hand {#refund-owed-by-hand}

**What you see.** A cancelled or returned order was paid in cash or by bank transfer. The order's
payment shows a refund that is still **open**, and the order is listed on the payment
"needs attention" list. The shop cannot send money out of your bank, so it waits for you.

**What to do.**

1. Pay the money back from the bank (or the till), for the amount shown.
2. Only then press **Mark returned** on that refund.

Pressing it is what closes the refund: the buyer gets the "your money is back" email and the credit
note is issued. Nothing is sent before you press it.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["order cancelled<br/>or goods returned"] --> B["refund opens<br/><i>and waits</i>"]
    B --> C["you pay the money back<br/><i>bank or till</i>"]
    C --> D["you press<br/>Mark returned"]
    D --> E["buyer emailed,<br/>credit note issued"]

    classDef auto fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef you fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,B auto;
    class C,D you;
    class E done;
```

::: warning Never press Mark returned before the money has left
The button only records that you paid. If the bank transfer then fails, the shop and the buyer both
believe they were paid back and nobody is left to notice.
:::

**Whose job.** Whoever holds the refund permission: the [moderator](./moderator.md) or the admin.
A card payment is different: the shop refunds the card itself, and has no hand step.
→ [`payments`](../modules/payments.md)

## A card refund the card refused {#card-refund-refused}

**What you see.** You refunded a card payment (or cancelled an order, or received a return), and
the refund sits **open**. On the payment, the refund reads **Failed** with a reason. If the reason
is one of the clear ones (the bank declined it, the card expired or was reported lost or stolen, or
the shop's own provider balance was too low), the payment's **Mark returned** button is offered and
the order is on the "needs attention" list at once. The shop does not keep sending a refund the bank
has refused for good.

**What to do.**

1. Agree with the buyer how to pay them back, for example a bank transfer to an account in their
   name. The shop does not store bank details: keep them in your mailbox and your bank, under your
   usual retention.
2. Pay the money back from your bank, for the amount shown.
3. Only then press **Mark returned** on that refund.

Pressing it closes the refund: the credit note is issued, a waiting return closes, and the buyer is
told their money is back.

If the reason reads **provider unavailable** or **no usable reason**, there is no Mark returned
button on purpose. The refund may have gone through, and the shop keeps asking the provider under
the same key until it has an answer. If it stays open for an hour, it shows up on the "needs
attention" list: check the provider's own dashboard (or its support) to see whether the money left.
If the provider is gone for good, that is a technician's job in the database, not a button.

If the payment's provider was removed from the shop, the reason reads **The payment provider is no
longer installed**: nothing was asked, so pay the buyer back yourself and press **Mark returned**.

::: warning Never press Mark returned before the money has left
The button only records that you paid. If the bank transfer then fails, the shop and the buyer both
believe they were paid back and nobody is left to notice.
:::

**Whose job.** Whoever holds the refund permission: the [moderator](./moderator.md) or the admin.
→ [`payments`](../modules/payments.md#when-a-card-refund-cannot-go-back)

## Refunded in the dashboard as well {#refund-covered-elsewhere}

**What you see.** Somebody refunded the buyer straight from the card provider's dashboard, and the
shop also holds its own refund for the same money. On the payment, that refund reads **open**
(waiting for you, or **Failed** with a clear reason such as "declined"), and the payment's
**Cancel refund** button is offered.

**What to do.**

1. Open the provider's dashboard and confirm the money really went back to the buyer.
2. Press **Cancel refund** on the shop's refund and write who refunded it, and where, in the note.

Cancelling is a void inside the shop only. Nothing is sent to the provider, no credit note is issued
and the buyer is not emailed: the money never moved from here. The amount becomes refundable again.
If the refund still reads **provider unavailable** or **no usable reason**, there is no Cancel
button on purpose: the shop may still be sending it, so wait for its answer first.

::: warning Never cancel a refund the shop already paid
A refund that reads **succeeded** cannot be cancelled: the money left, and voiding it would make
the books lie. If it was paid twice, the buyer holds the extra money: ask them for it.
:::

**Whose job.** Whoever holds the refund permission: the [moderator](./moderator.md) or the admin.
→ [`payments`](../modules/payments.md#cancelling-a-refund)

## Two refunds by mistake {#two-refunds}

**What you see.** Two partial refunds were opened for the same goods (the Refund button stays
available on purpose, so a double click can do it). The payment shows both.

**What to do.**

1. Open the payment's **Refunds** tab and read both refunds first.
2. A duplicate that is still **open** (waiting, or refused for a clear reason): press **Cancel
   refund** on it, with a note.
3. A duplicate that already shows **succeeded** is the buyer's money now. Write to them and ask for
   it back.

::: warning Never refund a negative amount to fix a duplicate
There is no such thing as a refund backwards. Cancel the open one, or ask the buyer.
:::

**Whose job.** The [moderator](./moderator.md) or the admin.
→ [`payments`](../modules/payments.md#cancelling-a-refund)

## A transfer for a cancelled order {#late-transfer}

**What you see.** The buyer's bank transfer arrives after their order was cancelled (they waited
too long, or somebody cancelled it). The money is real, the order is not payable any more.

**What to do.**

1. Record the transfer the usual way (see [Recording a transfer](./moderator.md#recording-a-transfer-and-why-a-paid-order-refuses-it)).
   The shop accepts it even though the order is cancelled.
2. The order **stays cancelled** and a refund for the full amount opens, owed by hand.
3. Send the money back, then press **Mark returned** (as in the entry above).

If the buyer still wants the goods, they order again. A cancelled order is never brought back.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["transfer arrives<br/><i>order already cancelled</i>"] --> B["you record it"]
    B --> C["order stays cancelled,<br/>refund opens"]
    C --> D["you send the money back"]
    D --> E["you press<br/>Mark returned"]

    classDef you fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef auto fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,B,D,E you;
    class C auto;
    class E done;
```

**Whose job.** The [moderator](./moderator.md) or the admin: both record payments and refunds.
→ [`payments`](../modules/payments.md#offline-payments)

## Fewer on the shelf than promised {#fewer-on-shelf}

**What you see.** You count the shelf, it holds fewer units than orders are waiting on, and the
correction is refused with a conflict: the stock figure cannot drop below what is already **set
aside** for orders that exist.

**What to do.**

1. Decide which orders you cannot fill.
2. Ask the [manager](./manager.md#an-order-s-life) to cancel them. The cancelled units come off
   "set aside" and a paid order is refunded.
3. Then record the count again as a correction.

::: warning The refusal is on purpose
The shop is saying "you have promised these units to real people". Cancel the orders first, then
correct the count. Never the other way round.
:::

**Whose job.** The warehouse counts and records. The manager cancels.
→ [The three numbers](./warehouse.md#three-numbers-not-one)

## An order stuck in processing {#stuck-in-processing}

**What you see.** An order is "being prepared" and stays there: nobody recorded a handover.

**What to do.** There are three honest ways out:

| The truth                                    | Do this                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The parcel left, nobody recorded it          | The warehouse [records the handover](./warehouse.md#getting-parcels-out-of-the-door)                  |
| The goods cannot be sent                     | The manager cancels the order (a paid order is refunded unless they say otherwise)                    |
| A parcel was scanned against the wrong order | An admin [corrects the status](./manager.md#correcting-a-mistake), with a reason that is written down |

**Whose job.** The warehouse for the first, the manager for the second, an admin for the third.

## Shipped but not arrived {#shipped-not-arrived}

**What you see.** The order says **shipped**, the parcel left a while ago, and nobody has recorded
its arrival. Nothing in the shop reminds you: it is a habit, not an alarm.

**What to do.** Look through the shipped orders about once a week. When a courier confirms the
delivery, the warehouse records the arrival (`POST /delivery/shipments/{id}/deliver`).

**Why it matters.** The order only moves to **delivered** after the last arrival is recorded. The
buyer's right to withdraw, and their legal guarantee, both count from that moment. Until it is
recorded, the clock has not started and the buyer's return window is still closed.

**Whose job.** The warehouse records; the [support desk](./support.md#where-is-my-order) is who
hears about it first, from a buyer asking where the parcel is.
→ [`delivery`](../modules/delivery.md#delivering)
