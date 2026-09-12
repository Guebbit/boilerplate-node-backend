# Scenarios next — 6. Seed a shop the app could have produced

Back to the [index](SCENARIOS_NEXT.md).

> **Status, 2026-09-12: D1–D6 built and deleted from this file** — see the index's
> [Done and deleted](SCENARIOS_NEXT.md#done-and-deleted) table for the commits and where each
> reason now lives (code docblocks, `docs/modules/webhooks.md`, `.env-example`). **D7 is the one
> item left**, and it's the paired frontend's, not this repo's.

**Question:** does the paired frontend still assert against seed data D1–D6 changed underneath it?

**My recommendation:** fix the two order-count assumptions and make the reorder spec assert
something real, in `boilerplate-vue-frontend`.

## D7 — frontend specs assume data the seed no longer has

| Evidence                                                                                                                                                                                                                                                                                                                                                                             | Why it matters          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| frontend `tests/support/e2e/fixtures.ts:159-161` and `orders.cy.ts:54-60` assume the customer's only order is the soft-deleted one — the customer has 3 visible (unchanged by D1: the same three `customerOrders` rows, now `delivered` instead of `pending`). `storefront.cy.ts:76` ("buying again refills the cart") passes vacuously: the owner's seeded cart already has 2 lines | a spec that cannot fail |

## Work

- [ ] fix the two order-count assumptions in `fixtures.ts` and `orders.cy.ts`
- [ ] make the reorder spec (`storefront.cy.ts:76`) assert the reordered line, not just that the
      cart is non-empty

## Answer

Decided 2026-09-11: yes, fix as listed.
