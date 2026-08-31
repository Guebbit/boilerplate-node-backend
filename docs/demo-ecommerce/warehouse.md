# The warehouse

Stock, and getting parcels out of the door.

## The one rule

**Nobody types a stock number in directly.** Not the manager, not the shop, not anyone.

Stock only ever moves because something happened, and that something is always recorded. There are
six ways a number can change and no seventh:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 28, 'rankSpacing': 55}}}%%
flowchart LR
    A["a delivery arrives"] -->|"more stock"| L["the stock diary<br/><i>every movement, with its reason</i>"]
    B["you count the shelf<br/>and it disagrees"] -->|"corrected"| L
    C["a customer checks out"] -->|"set aside"| L
    D["they pay"] -->|"sold"| L
    E["they cancel"] -->|"back on the shelf"| L
    F["they never paid<br/><i>30 minutes passed</i>"] -->|"back on the shelf"| L

    classDef you fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef auto fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef book fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class A,B you;
    class C,D,E,F auto;
    class L book;
```

Blue is you doing something. Amber happens on its own. Either way the diary gets a line, so
"why is this number 23?" always has an answer.

::: tip Why this matters
A shop where anyone can overwrite the stock figure is a shop where the figure is eventually wrong
and nobody can say when it went wrong. Recording the _reason_ instead of the _result_ means the
number can always be rebuilt from its history.
:::

→ [`inventory`](../modules/inventory.md)

## Two numbers, not one

Every product carries two figures, and confusing them is the classic warehouse mistake:

| Figure        | Means                                                      |
| ------------- | ---------------------------------------------------------- |
| **On hand**   | Physically on the shelf right now                          |
| **Set aside** | Of those, how many are already promised to unpaid orders   |
| **Available** | On hand minus set aside — what a customer can actually buy |

A product with 10 on hand and 4 set aside sells to 6 more people, not 10.

## The two things you do by hand

**A delivery arrived** — record what came in. Stock goes up, the diary gets a line.

**The count is wrong** — record the correction. Somebody dropped a box, or two got miscounted at
some point. Stock moves to the true figure, the diary gets a line saying it was a correction rather
than a sale.

Both are entries in a book, not edits to a number. That distinction is the whole design.

## Clearing expired holds

When a customer checks out but never pays, their goods sit "set aside" for 30 minutes and then need
releasing.

::: warning This does not happen by itself
The shop does not ship with anything that runs on a timer. **Somebody or something has to trigger
the sweep** — the job that finds expired holds and puts the goods back.

Until it runs, those goods are invisible to customers even though nobody is buying them. Run it at
least as often as the hold lasts.
:::

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["the sweep runs"] --> B{"any holds<br/>older than 30 min?"}
    B -->|no| C["nothing to do"]
    B -->|yes| D["goods back on the shelf"]
    D --> E["the order is cancelled"]
    D --> F["the diary records it"]

    classDef act fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef check fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A act;
    class B check;
    class C,D,E,F done;
```

→ [the detail](../modules/inventory-reservations.md)

## The running-low list

There is a stock board showing everything with a "show me only the low ones" filter. Anything at
**5 or fewer** counts as low, unless that figure is changed.

In the demo, Miciona inutile sits at zero — a permanent example of what the bottom of that list
looks like.

## Getting it out of the door

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["order is paid"] --> B["pack it"]
    B --> C["mark it shipped"]
    C --> D["parcel record created"]
    C --> E["tracking code generated"]
    C --> F["customer emailed<br/><i>in their own language</i>"]
    G["advance the courier<br/><i>a button</i>"] --> H["delivered"]

    classDef act fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef auto fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,B,C,G act;
    class D,E,F,H auto;
```

The three things after "mark it shipped" all happen on their own. You do not create the parcel, or
write the tracking number, or send the email.

**The courier is pretended.** In a real shop a delivery company would report progress; here there is
a button that moves a parcel to _delivered_ so the last step of the journey can be shown without
waiting for a van. → [`delivery`](../modules/delivery.md)

## The words we used

| Word           | In plain terms                                                                          |
| -------------- | --------------------------------------------------------------------------------------- |
| **On hand**    | Physically present on the shelf.                                                        |
| **Set aside**  | On the shelf, but promised to an unpaid order. → [`inventory`](../modules/inventory.md) |
| **Available**  | On hand minus set aside. What can still be sold.                                        |
| **The sweep**  | The job that releases holds nobody paid for. Must be triggered.                         |
| **Adjustment** | A recorded correction after counting the shelf.                                         |
| **Receipt**    | A recorded delivery from a supplier.                                                    |
