# payments

::: tip At a glance
**Owns** — an order's money, behind a provider port. The intent freezes a total; the confirm moves the order to `paid`.
**Depends on** — [`orders`](./orders.md), [`inventory`](./inventory.md), [`users`](./users.md).
**Breaks if you change** — the confirm path. It is the single moment held units become a sale.
:::

## The story

A payment is _about_ an order: the intent freezes its total, the confirm moves its status to
`paid`. The arrow never comes back — [`orders`](./orders.md) announces `order.cancelled` and this
module answers with the refund.

**The confirm is the one place where the money and the goods agree.** It commits the order's held
units itself rather than announcing and hoping, because that instant is the only moment a hold
becomes a sale. Without this module nothing would ever commit a hold, and every order would sit
reserved until its window expired.

::: tip The provider is a port, and the implementation is fake on purpose
Nothing above `providers/` knows which processor is wired in. The fake is what lets the whole
checkout-to-paid path run in tests and in the demo profile without a sandbox account. Swapping in a
real processor is one file behind an interface that already exists.
:::

The dependency on [`users`](./users.md) is groundwork rather than a current feature. The order
already carries a `userId`; resolving it against the account record is what makes the id on a
payment document worth querying later, when "everything this account has paid" becomes a screen.
An unresolvable payer is logged rather than refused.

`unique: true` on `orderId` is the guard against a double charge: one payment per order is a
database fact, not a check somebody has to remember.

Delete this module and cancelling an order still releases its stock but returns no money — which is
exactly the sentence `CANCELLABLE_ORDER_STATUSES` documents.

## Related pages

- [The provider port](./payments-provider-port.md) — the interface and the fake behind it
- [`orders`](./orders.md) — what a payment is about
- [`inventory`](./inventory.md) — the units this module commits
- [Layers](../theory/layers.md) — what a port is and where it sits
- [Security](../tools/security.md) — what is never stored here
