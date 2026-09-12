# Scenarios next — 6. Seed a shop the app could have produced

Back to the [index](SCENARIOS_NEXT.md).

> **Status, re-verified at `aaf4789c` on 2026-09-11: decided, not started.** Every finding below
> still holds.
>
> **Amended 2026-09-12**, three changes:
>
> - D1's oversell is no longer **silent** — `6eaf0ffd` reads the reservation on a missed claim and
>   emits `admin.commit.orphaned`. The unreachable state is still there, so D1 A still applies; it
>   is no longer urgent.
> - D4 is answered the other way: `POST /products` will write an opening `receive` movement rather
>   than have its exemption documented.
> - the `placekitten.com` nit is four code sites and two `.env-example` lines, not one — see the
>   nits below.

**Question:** how much realism does `shop` need now, before [OFFLINE_PAYMENTS 3](OFFLINE_PAYMENTS_3_REALISTIC_HISTORY.md) can
produce real history by driving the app?

**Blocks:** [7](SCENARIOS_NEXT_7_GUARANTEES_FRONTEND.md)'s guarantee predicates, and several
frontend specs that pass or fail on this data.

**My recommendation:** fix the contradictions now (D1 option A, D2, D3, D5). Leave realistic
history — payments, shipments, a stock ledger — to [OFFLINE_PAYMENTS 3](OFFLINE_PAYMENTS_3_REALISTIC_HISTORY.md).

The test for each row below: **could the application itself have produced this state?** Where it
could not, a spec asserting on it tests a shop that cannot exist.

## Findings

| #   | Finding                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **all 19 orders are `pending`, and none holds stock**             | `orders/factories.ts:47-56` drops `status` from `OrderOverrides`, calling it "never stored" — it is stored, default `pending` (`orders/model.ts:194-198`). Every real pending order holds stock (`cart/services/checkout.ts:223`, `orders/services/crud.ts:208`) and is cancelled by the sweep after 30 minutes (`inventory/service.ts:297-308`)                                                                                                                                                                                                     | an unreachable state. Worse: the owner can pay order `65de73a6…`, which holds 10 × `scratchPostOutOfStock` (`onHand: 0`). `commitForOrder` finds no hold, so the units never leave — a paid oversell. Since `6eaf0ffd` it is at least alarmed (`admin.commit.orphaned`, outcome `failure`) instead of a silent `false`, and `settlement.ts`'s comment was corrected with it. The state is still one the app cannot produce |
| D2  | **four of five audit rows contradict the seeded state**           | `scenarios/audit-logs.ts`: row 1 — the customer "created" the owner's order. Row 3 — `target_type: 'localeEntry'` and a key as id, where the emitter writes `'locale_entry'`, the entry `_id` and `metadata: { locale, key }` (`locales/services/entries.ts:136-143`); that key is not seeded in `it`. Row 4 — marcus "banned", but seeded `active: true` with a cart and orders. Row 5 — a refund on `661c795a…`, which has no payment and is `pending`. No row carries `actor_scope`, which the emitter always sets (`observability/audit.ts:253`) | the audit screen shows a history the rest of the shop denies                                                                                                                                                                                                                                                                                                                                                               |
| D3  | **the `es` and `fr` entries use keys the frontend does not have** | `scenarios/locales.ts:101-141,184-185` seed `products.list.title`, `cart.title`, … — none of the ten exist in any of the frontend's 18 `en.json` files, whose keys look like `products-list-page.page-title`. And live: the demo boot logs "no dictionary file is deployed for es; rows ignored"                                                                                                                                                                                                                                                     | the frontend's `locale.cy.ts:211-220` ("falls back per key") cannot tell merged overrides from none. The `es` overrides are dropped entirely                                                                                                                                                                                                                                                                               |
| D4  | the stock ledger is empty while counters say thousands in stock   | seeds write `onHand` directly, so `GET /inventory/movements` is `[]` — against "a counter never moves without a ledger row" (`inventory/service.ts:3`). `GET /inventory/levels` lists soft-deleted and inactive rows too (`products/repository.ts:302-319`)                                                                                                                                                                                                                                                                                          | the app can reach it too: `POST /products` accepts `onHand` without a receipt (`products/controllers/create-product.ts:33-51`) — a product question, not only a seed one                                                                                                                                                                                                                                                   |
| D5  | **the demo webhook subscription can never deliver**               | the documented sink is `http://webhook-tester:8080` (`.env-example:657`). The SSRF guard refuses anything but `https:` and any private address (`infrastructure/adapters/ssrf-guard.ts:109`). After 5 failures the subscription disables itself (`src/modules/webhooks/services/attempt.ts:82`)                                                                                                                                                                                                                                                      | the exact "dead subscription auto-disabling" its docblock says it avoids (`scenarios/webhooks.ts:7-9`). The ring secret's plaintext is also discarded (`:57`), so a sink could not verify signatures anyway                                                                                                                                                                                                                |
| D6  | guarantee predicates weaker than their names                      | `scenarios/products.ts:366-369`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | see [7](SCENARIOS_NEXT_7_GUARANTEES_FRONTEND.md)                                                                                                                                                                                                                                                                                                                                                                           |
| D7  | frontend specs assume data the seed no longer has                 | frontend `tests/support/e2e/fixtures.ts:159-161` and `orders.cy.ts:54-60` assume the customer's only order is the soft-deleted one — the customer has 3 visible. `storefront.cy.ts:76` ("buying again refills the cart") passes vacuously: the owner's seeded cart already has 2 lines                                                                                                                                                                                                                                                               | a spec that cannot fail                                                                                                                                                                                                                                                                                                                                                                                                    |

Nits:

- `scenarios/orders.ts:73` says the lines total 1,540. 84 × 20 = 1,680. `shippingCost: 0` is
  still right.
- All 16 history orders share one `createdAt`: the index sits in the id's low bytes (`orders.ts:54`).
- `snapshotOf` (`orders.ts:24-41`) drops `categories`, `tags`, `thumbnailUrl`, `requiresShipping`,
  which checkout freezes (`cart/services/checkout.ts:176-179`).
- The `placekitten.com` fallback is dead (HTTP 521 on 2026-09-11) and it is **six** places, users
  included: `products/model.ts:182`, `users/model.ts:292`, the two `schema-contract.test.ts` copies
  that assert the same literal, and `.env-example:263-264`, which sets both as real defaults rather
  than leaving the fallback unused. Decided 2026-09-12: a local placeholder under `public/images/`,
  addressed `/images/<name>` like every seeded image (`generate-seed-images.ts:106`). No live
  third-party host — `picsum.photos` would rot the same way.

Checked and clean: order totals and shipping; carts reference only active products and would check
out; wishlists and address books; every product has `en` and `it` translations on active locales;
editor and moderator memberships resolve to exactly their YAML keys; all five audit action names
are still emitted; `blank` gives four working logins (also verified live).

## Options for D1

| Option                                                                                                                                                                            | For                                                          | Against                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **A** `makeOrder` accepts `status`. History orders become `delivered` or `cancelled`. Drop the 10 × out-of-stock line. `pending` stays only where a real hold exists — none today | removes the oversell and the unreachable state, now, cheaply | `delivered` with no payment or shipment row is still not what the app produces — until OP 3 |
| **B** leave it for OFFLINE_PAYMENTS 3                                                                                                                                             | one change instead of two                                    | the oversell stays reachable in every demo until then                                       |
| **C** hand-write the matching payment and shipment rows                                                                                                                           | realistic now                                                | hand-writes exactly what OP 3 exists to produce                                             |

**My suggestion: A.** Small, and it closes a payable oversell today.

## Options for D5

| Option                                                                         | For                                 | Against                                           |
| ------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------- |
| **A** a demo-only SSRF allowance for the sink host                             | the documented setup works          | a hole in a security control — asked, not decided |
| **B** document an `https` tunnel (webhook.site, a local TLS proxy) as the sink | no code; the guard stays whole      | one more setup step                               |
| **C** stop seeding the subscription                                            | nothing that cannot work is shipped | the admin screen has no example row               |

Do you use `NODE_WEBHOOK_DEMO_SINK_URL` today? If not, **C**. If yes, **B**.

## Work

- [x] D1 per the answer — `b5891c9a`: `makeOrder` takes `status`; history orders are
      `delivered`/`shipped`/`cancelled`; the out-of-stock line dropped; `order.ownerPending`
      added, holding real stock through `inventoryService.reserveForOrder`
- [ ] D2 point each audit row at state that matches: the customer's own order; the real entry `_id`
      with `target_type: 'locale_entry'`; marcus `active: false`; the refund row only with a
      refunded payment (or drop it until OFFLINE_PAYMENTS 3); add `actor_scope`
- [ ] D3 seed a few real frontend keys; the frontend spec asserts one Spanish string next to one
      English fallback. Check which languages have a dictionary before seeding overrides for them
- [ ] D4 document the exemption now; opening `receive` rows come with OFFLINE_PAYMENTS 3
- [ ] D5 per the answer
- [ ] D7 frontend: fix the two order assumptions; make the reorder spec assert the reordered line
- [x] the shipping-total nit (`ownerShipped`'s comment) — fixed alongside D1, `b5891c9a`: the wrong
      count is deleted, not corrected, per [9](SCENARIOS_NEXT_9_SWEEP.md#how-to-treat-an-item)
- [ ] the remaining nits (`snapshotOf`'s dropped fields, all-16-orders-share-one-`createdAt`,
      `placekitten.com`)

## Answer

Decided 2026-09-11.

- [x] D1 — A now. Keep one `pending` order with a real hold, for `order.ownerPending` in 7. The
      static history is replaced by [OFFLINE_PAYMENTS 3](OFFLINE_PAYMENTS_3_REALISTIC_HISTORY.md)
- [x] D5 — A, development and test only (answered). Shape:
    - an exact-hostname list that skips the `https:` and private-address checks, for **webhook
      delivery only** — not every SSRF-guarded call
    - honoured only when `NODE_ENV` is `development` or `test`; set under `production`, the boot
      refuses
    - the seeded subscription gets a fixed, documented demo secret, so webhook-tester can verify
      signatures
    - docs: `NODE_WEBHOOK_DEMO_SINK_URL` gets its page (see [9](SCENARIOS_NEXT_9_SWEEP.md#docs-pages))
- [x] D2, D3, D7 — fix as listed: yes
- [x] D4 — **answered 2026-09-12: `POST /products` writes the opening `receive` movement.** Not
      just documented. The invariant `inventory/service.ts:3` states ("a counter never moves without
      a ledger row") then holds on every path, and `GET /inventory/movements` stops being empty for
      anything the app created. `PATCH` keeps refusing `onHand` — the ledger is the only way to move
      it afterwards. Its own commit, since it touches inventory and the products contract. Rejected:
      refusing `onHand` on create too, which breaks every seeded row and every client that creates a
      product with stock in one call. Seeded rows still get their opening rows from
      [OFFLINE_PAYMENTS 3](OFFLINE_PAYMENTS_3_REALISTIC_HISTORY.md)
