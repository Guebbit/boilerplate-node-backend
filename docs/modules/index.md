# Modules

One page per domain, top to bottom. This is the **vertical** cut through the codebase; the rest of
this site is the horizontal one.

::: tip Which section answers which question
| You want | Read |
| --- | --- |
| What a module _is_, and the rules every one obeys | [Theory](../theory/) |
| What **this** domain does, end to end | a page in this section |
| How a mechanism works, in general | [Tools](../tools/) |
| The contract-first workflow | [API](../api/) |
| "I landed on a filename" | [Files](../reference/) |
:::

The division is one rule: **a horizontal page owns a mechanism, a module page owns a decision.**
[Winston & Audit Logs](../tools/winston.md) explains what an audit action is; the
[`cart`](./cart.md) page lists which two cart writes and links back. Neither says the other's half.

The test that keeps it honest is the one this architecture is already built on — delete
`src/modules/cart/` and exactly one page in this site dies with it. Every other page loses a link
and nothing else.

## Every module

Grouped by subdomain, which is the first thing worth knowing about a domain: whether it is the
reason the product exists, something specific to this business that is not a differentiator, or a
solved problem where modelling effort would be waste.
[Strategic DDD](../theory/strategic-ddd.md) is where those three words are defined.

**core** — the reason the product exists.

- [`cart`](./cart.md) — `/cart`. One document per user, and checkout, the transaction the whole
  shop turns on. Deeper: [Checkout](./cart-checkout.md).
- [`orders`](./orders.md) — `/orders`. What a checkout produces, its status machine, and its
  invoice.
- [`products`](./products.md) — `/products`. The catalogue, its search surface and its cache.

**supporting** — specific to this business, but not a differentiator.

- [`delivery`](./delivery.md) — `/delivery`. Shipping rates as pure rules, and a fake courier
  driven by hand.
- [`inventory`](./inventory.md) — `/inventory`. The only writer of stock in the application.
  Deeper: [Reservations](./inventory-reservations.md).
- [`payments`](./payments.md) — `/payments`. An order's money, behind a provider port. Deeper:
  [The provider port](./payments-provider-port.md).
- [`wishlist`](./wishlist.md) — `/wishlist`. The smallest domain here, and the one to read first.

**generic** — a solved problem, kept plain.

- [`account`](./account.md) — `/account`. Who is making this request, plus the address book.
  Deeper: [Sessions](./account-sessions.md).
- [`audit-logs`](./audit-logs.md) — headless. Owns the trail and no URL of its own.
- [`feedback`](./feedback.md) — `/feedback`. Contact submissions and what an admin does with them.
- [`locales`](./locales.md) — `/locales`. Language discovery and the API's own message dictionary.
- [`observability`](./observability.md) — `/observability`. Health, metrics, the audit read and the
  SSE stream.
- [`users`](./users.md) — `/users`. Admin-side user management; the self-service half is
  `account`.

Every route in the application, in one table, is [Endpoints](../api/endpoints.md). What each file
inside a module folder is, is [Modules (files)](../reference/src-modules.md).

## The two repositories

Eleven of thirteen domains exist on both sides under the same name. **The interesting two do not**,
and neither does the frontend's third extra module — an asymmetry that is real architecture rather
than drift, and that is written down nowhere else in either repository.

| This repository | `boilerplate-vue-frontend` | Note                                                                                                                                                            |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-logs`    | `admin`                    | This module owns the trail and no URL; the endpoint that reads it belongs to `observability`, and the screen that renders it is the frontend's admin dashboard. |
| `observability` | `admin` + `realtime`       | Its two surfaces are consumed by two different frontend modules: the health and metrics reads by `admin`, the SSE stream by `realtime`.                         |
| everything else | the same name              | —                                                                                                                                                               |

And one frontend module answers to nothing here: `demo`, a client-side showcase of the shared UI
kit, which pairs with the demo profile and the seeded dataset rather than with any single domain.

`tests/cross-cutting/frontend-pairing.test.ts` holds this map to the code: a module added here with
no entry fails, an entry naming a module that no longer exists fails, and a counterpart that is not
simply the same name has to carry its reason. The gap cannot widen quietly.
