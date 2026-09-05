# The demo shop

**A small online shop that really works.** You can browse it, put things in a basket, pay, and
watch the parcel go out. Nothing here is a mock-up or a slideshow — it is the real thing, with
pretend money and a pretend courier.

::: tip Who this section is for
People who need to understand **what the application does**, not how it is built. No code on any of
these five pages. Every technical word is explained the first time it appears, and links point to
the deeper page if you ever want it.

The rest of this site is written for developers. This part is not.
:::

## The whole shop on one picture

Someone buys something. That is the sentence the entire application exists to support:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["a visitor<br/><i>browses the shop</i>"] --> B["puts things<br/>in a basket"]
    B --> C["checks out<br/><i>picks an address and a delivery</i>"]
    C --> D["the goods are<br/>set aside"]
    D --> E["pays"]
    E --> F["the shop packs<br/>and ships it"]
    F --> G["it arrives"]

    classDef shopper fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef shop fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,B,C,E shopper;
    class D,F shop;
    class G done;
```

Blue is the customer doing something. Amber is the shop doing something in the background. Every
other page in this section is one of those boxes, opened up.

## What the shop sells

132 products — a pet-supply retailer. Six are hand-picked, each there to show the shop behaving
differently; the other 126 are a combinatorial grid (six animals × seven product types × three
quality tiers) so lists, pagination and the category filters have enough real rows to work with:

| Product                                              | Price | In stock | Why it exists                                      |
| ---------------------------------------------------- | ----- | -------- | -------------------------------------------------- |
| Premium Grain-Free Dog Food, 15kg                    | €68   | 30       | a completely normal product                        |
| Orthopedic Memory Foam Dog Bed                       | €84   | 45       | another normal one, so baskets can have two lines  |
| Heavy-Duty Cat Scratching Post                       | €45   | **0**    | shows what "out of stock" looks like               |
| Universal Small Animal Water Bottle                  | €9    | 100      | has only a name and a price, nothing else          |
| 150W Ceramic Heat Emitter                            | €55   | 12       | **deleted** — proves a deleted product disappears  |
| Rabbit Starter Bundle — Hutch, Feeder & Water Bottle | €96   | 18       | **switched off** — visible to staff, not to buyers |
| _...126 more_                                        | —     | —        | a generated catalogue, e.g. "Premium Bird Carrier" |

So a visitor sees **130** products (the four ordinary ones above, plus all 126 generated).
Staff see all 132. That difference is deliberate and it is explained on
[the shop manager's page](./manager.md).

## The two people in it

Two accounts come with a password you can actually type in:

| Who            | Username       | Password   | Can do                            |
| -------------- | -------------- | ---------- | --------------------------------- |
| **A customer** | `ginopinoshow` | `password` | shop, buy, track their own orders |
| **The owner**  | `root`         | `rootroot` | everything, plus run the shop     |

There are only these two levels. Either you are staff, or you are a customer. There is no
"warehouse-only" or "support-only" login — those are jobs, not accounts, and this section splits
the pages up that way because it is easier to read, not because the software does.

A further ten customer accounts exist too — `amelia.clarke`, `benjamin.hughes` and so on — with an
order history spread across them (mostly one small order each, three with a couple more) so the
staff side has more than one shopper's activity to look at. Nobody is meant to log in as one of
the ten; they exist to be _looked at_, not signed into.

## Money and delivery

Prices are in **euros**. Delivery is picked by the customer at checkout:

| Delivery   | Costs | Note                         |
| ---------- | ----- | ---------------------------- |
| Standard   | €5    | **free** on orders over €100 |
| Express    | €15   | always €15                   |
| Pick it up | €0    | the customer collects it     |

Paying is fake. There is no real card processing and no real money — a made-up card number is
accepted, and one specific number (`4000000000000002`) is always refused, so the "your card was
declined" path can be shown on demand.

## Which page do you want

| You are…                                    | Read                             |
| ------------------------------------------- | -------------------------------- |
| Wondering what a customer experiences       | [The customer](./shopper.md)     |
| Running the shop — products, prices, orders | [The shop manager](./manager.md) |
| Looking after stock and getting parcels out | [The warehouse](./warehouse.md)  |
| Answering emails, resets, complaints        | [The support desk](./support.md) |
| A developer who took a wrong turn           | [Modules](../modules/)           |

## Opening it yourself

Two things to type, and you need nothing installed but Node:

```bash
npm install
npm run demo
```

That starts the shop with its own throwaway database, already filled with everything described
above. Close it and it all disappears; start it again and it is back exactly as it was. Nothing you
click can break anything permanently.

::: info This section describes _this_ shop
The application underneath is a reusable starting point — a **boilerplate** — and this pet-supply
shop is just the example built on top of it. These five pages describe the example. The pages under
[Modules](../modules/) describe the parts it is assembled from, one per area of the business.
:::
