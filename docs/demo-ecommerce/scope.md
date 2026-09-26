# What this demo models

**One place to check "does it do X", instead of guessing from a scattered comment or a missing
page.** Three buckets: built today, coming later, and deliberately never.

::: tip Who this section is for
Same audience as the rest of this section — no code, just what the shop does and does not do. See
the [overview](/demo-ecommerce/) if you landed here first.
:::

## Built today

- **One shop, one organisation, one country's VAT.** This isn't a marketplace or a multi-tenant
  platform — it's the shop a single business runs.
- **Standard shipping only**, at a flat rate per method. No live carrier rates, no split shipments.
- **Guest checkout isn't offered yet** — every order belongs to a signed-in account.
- **No coupons, no discounts, no chargebacks.** A price is the price; a dispute is handled by hand,
  outside the shop.
- **No partial payments.** An order is paid in full, in one attempt, or it isn't paid.
- **Editing a placed order is its own separate action**, not a return trip through checkout — the
  shop and the customer see the same trail of what changed and when.

## On the roadmap

Decided, or partly built, but not the whole story yet:

- **Product variants.** A single SKU per product today; size/colour variants are a planned
  extension, not a redesign.
- **Returns, partial refunds, and a withdrawal button.** The law changed in mid-2026 to require an
  explicit "withdraw from this order" action on every EU-facing shop, with its own confirmation
  step and a written acknowledgement — that's being built, alongside partial refunds for the cases
  a full refund doesn't fit (an express-shipping surcharge, for instance).
- **A proper invoice**, separate from the order receipt every paid order already gets, with its own
  numbering and the fields a business customer needs.
- **Ship-to addresses beyond the seller's own country**, with a proper country list instead of a
  short hand-picked one.
- **Digital goods** that are never physically shipped, priced and taxed correctly.

## Genuinely out of scope

Not "not yet" — these would change what kind of shop this is, and aren't planned:

- Multiple currencies, price lists or regions, or running more than one shop from one deployment.
- A marketplace with several sellers, or B2B-specific VAT handling (reverse charge, VIES checks,
  the EU's distance-selling threshold).
- More than one warehouse.
- Subscriptions or recurring billing.
- Gift cards or store credit, authorise-then-capture payments, backorders or pre-orders,
  compare-at ("was/now") pricing, a category tree, product bundles, or country-specific
  e-invoicing formats.

Every one of these is a real, well-understood shop feature — they're absent because this is a
_demonstration_ of the patterns underneath a shop, not a bid to be every kind of shop at once.
