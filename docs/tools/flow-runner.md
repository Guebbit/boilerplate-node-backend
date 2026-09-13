# The flow runner

`scenarios/flows/` writes the `shop` scenario's order book by DRIVING the application, not by
inserting rows. Every order in the demo shop was placed at `POST /cart/checkout`, paid at
`POST /payments/…`, shipped through the real lifecycle and — where the story calls for it —
declined, refunded, cancelled or deleted through the endpoint a person would use.

::: tip At a glance
**Drives** — the real app, over real HTTP, on a throwaway loopback listener.
**Runs** — once per process; every later restore replays what it produced.
**Owns** — `scenarios/flows/`: `shop-history.ts` (the story), `actions.ts` (the moves), `client.ts`
(the HTTP caller), `loopback.ts` (the listener), `backdate.ts` (the date rewrite).
:::

[Demo profile](./demo-profile.md#how-a-scenario-is-built) covers the shape: seed the starting rows,
drive the flows, backdate, copy into memory. This page is the mechanism underneath each step.

## Driving without a port

The flows call the app over real HTTP, but the demo profile has not bound `NODE_PORT` yet — the
flows have to finish before the paired frontend's readiness probe would see anything. `scenarios/
flows/loopback.ts` is what makes that possible: `withLoopbackServer` starts a throwaway
`http.Server` on `127.0.0.1:0` (an OS-assigned port), runs the flow against it, and closes it —
`app.listen()` builds a fresh server each call, so this never collides with the real one.
`scenarios/apply.ts` reaches for the same helper for a different reason: it has no server at all.

`scenarios/flows/client.ts` is what the flows call through — one base URL, one bearer token per
signed-in `Caller`, and envelope-unwrapping every call would otherwise repeat. It runs on a
container boot (`npm run db:bootstrap` → `scenario:apply`), where devDependencies may not be
installed, so it uses the runtime's own `fetch` rather than `supertest`. A call the flow expected
to succeed but did not throws `ScenarioFlowError`, which names the actor, the request and the
response — the failure mode you saw if you have ever watched a seed die partway through a boot.

## The magic payment methods

The fake PSP (`src/modules/payments/providers/fake.ts`) answers to a handful of fixed method
handles instead of a real card network, and the flows use them to script every payment outcome the
demo shop needs:

| Handle                            | `CARD.` constant | What happens                                                                       |
| --------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `pm_card_visa`                    | `visa`           | Settles immediately.                                                               |
| `pm_card_declined`                | `declined`       | 409 `PAYMENT_DECLINED`, retryable with another method.                             |
| `pm_card_authentication_required` | `challenge`      | `requires_action` — a 3-D Secure challenge, finished at `POST /payments/:id/sync`. |

`scenarios/flows/shop-history.ts` uses `declined` then `visa` on the same order for the "a card
refused, then paid with another" case, and `challenge` for the 3-D Secure one — the same retry and
challenge flows the paired frontend's own specs drive against a real card form.

## Once per boot: the mechanism behind the copy

`src/app/demo.ts`'s `buildOnce` is what "once, then replayed" (see
[Demo profile](./demo-profile.md#how-a-scenario-is-built)) actually is in code: a `Map<name,
ScenarioCopy>` keyed by scenario name, checked before anything is built. The first restore of a
name calls `buildScenario`, then `captureDatabase()` — read every collection into memory as plain
BSON — and keeps the result. Every later restore of that name skips straight to
`restoreDatabaseCopy()`: empty every collection, `insertMany` the copy back with `ordered: false`
so one bad document does not abandon the rest.

Measured 2026-09-13, on this machine: a `shop` restore replay runs in roughly 12 ms against the
several-hundred-request build it replays; a `blank` restore (no flows to drive) in roughly 6 ms.

Restores are serialised through a queue in `src/app/demo.ts`, not run as called: two overlapping
restores emptying and reseeding the same collections would interleave their writes, and two
concurrent replays of the same copy would collide on `_id`.

## Backdating: one order, one trail, together

The flows run at boot, so without correction every order in the demo shop would be dated the
minute the container started — no trend on an analytics chart, no "last 30 days" filter with
anything outside it. `scenarios/flows/backdate.ts` moves each order's whole trail into the past
— the order, its payment, its shipment, its reservation, its stock movements and its audit rows —
by the same number of days, so all six still agree with one another about when any of it happened.

It moves PER ORDER, never with one blanket shift across the collection: `TRAILS` closes over each
of the six models separately (an order's date columns are not a payment's, and `stockmovements`/
`auditlogs` hold the order id as a free-text string rather than an `ObjectId` reference), and the
write itself is a `$dateSubtract` aggregation pipeline with `timestamps: false` — without that flag
Mongoose would re-stamp `updatedAt` with the current time on the very row the pass is trying to
move into the past.

Audit rows are written fire-and-forget (`emitAuditEvent` returns `void`), so the last few a flow
produced may still be in flight when the final HTTP response has already come back.
`settleAuditTrail` waits for two equal row counts a beat apart before backdating starts — a slow
machine waits longer, a fast one barely waits at all — rather than a fixed sleep that would be
wrong in one direction or the other.

Two rows stay dated TODAY on purpose: an order still holding stock against a deadline (an owner's
pending order, a bank-transfer order awaiting payment) would have its hold expire before the shop
even opened if it were backdated too.

## What the runner sets for itself

`scenarios/rate-limits.ts` is what makes a script safe to run at all: every rate-limit budget a
person-sized default would throttle is raised to a scripted allowance
(`NODE_RATE_LIMIT_REDIS_ENABLED=0` too, so the counters live and die with the process rather than
spending a real deployment's Redis-backed allowance). It also carries `DEMO_BANK_TRANSFER` — a
fictional `NODE_BANK_TRANSFER_BENEFICIARY`/`_IBAN` pair, since the `shop` scenario's
`order.awaitingTransfer` guarantee needs bank transfer offered at all
(see [Bank transfer](../modules/payments.md#bank-transfer) for the feature itself). Both
`run-server.ts` and `apply.ts` apply these only where nothing is already set, so a deployment
naming its own values keeps them.

`NODE_WEBHOOK_DEMO_SINK_URL` is separate, and not applied by either of the above: unset (the
default), `scenarios/webhooks.ts` seeds no demo subscription at all — a developer who never enables
the `webhook-tester` compose profile never gets a dead subscription auto-disabling in their logs.
Set it and a subscription appears, pointed at the sink, with a fixed and documented secret so a
captured delivery's signature is a copy-paste rather than a mystery — see
[Seeing it work](../modules/webhooks.md#seeing-it-work). Honoured only in development/test.

## The seeded language coverage

`scenarios/locales.ts` seeds five languages, each chosen to demonstrate one state a language and
its entries can be in — not five demo rows so much as five points on a small grid:

| Role           | Tag                         | What it demonstrates                                                                                                                                              |
| -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`       | (the deployment's fallback) | The catalogue's own source language — every product's fallback-locale `translations` row must exist and be active before anything else can be written against it. |
| `downloadable` | `es`                        | Exists only as rows, no deployed dictionary file — downloadable from the API at runtime.                                                                          |
| `answerable`   | `it`                        | Deployed as files AND registered here, so its shipped copy can be overridden per key.                                                                             |
| `draft`        | `fr`                        | Being translated, not yet published.                                                                                                                              |
| `empty`        | `ja`                        | Registered and not yet translated at all.                                                                                                                         |

`locales` finishes seeding before the rest of `shopModules` runs concurrently — see
[Strategic DDD](../theory/strategic-ddd.md#reading-the-map) — because `products.seed()` writes its
rows' `translations` through a path that requires every locale in that write, the fallback
included, to already exist as an ACTIVE row first.

## The guarantee mechanism

A module states what it needs the `shop` scenario to demonstrate as data, right on its manifest —
`products/module.ts`, say:

```ts
scenario: {
    shop: ['product.softDeleted', 'product.inactive', 'product.outOfStock' /* … */];
}
```

Each name is a PROMISE: somewhere in `shop`, a row exists in that state. `scenarios/check.ts`'s
`findUnmetGuarantees` is what holds the promise to account — it compares every declared name
against `subjects`, the map `buildScenario` returns, in both directions: a guarantee with no
matching subject is a promise the backend cannot keep, and a subject no module declares is a name
left behind after the module that wanted it was deleted. `tests/integration/scenarios/shop.test.ts`
runs this check against the REAL built scenario; `tests/unit/scenarios/check.test.ts` proves the
comparison itself, fed a hand-made map.

Where the id on the other side of the promise comes from depends on what kind of row it names:

- A row `shopModules` SEEDS (a product, a locale entry) — its id is a literal, pinned in
  `scenarios/subjects.ts`.
- A row the flows PRODUCE (an order, a payment) — its id cannot be a literal, since it is minted
  when the flow runs. `scenarios/flows/shop-history.ts` records it into its own return value as it
  goes, and `buildScenario` merges that into the pinned map.

**To add one:** declare the name under the module's `scenario.shop` array, then either pin a
literal in `subjects.ts` (a seeded row) or have the flow that produces the row record its id into
`ShopHistory.subjects` under that same name (a flow-produced one). Skip either half and
`shop.test.ts` fails naming exactly which.

## Timestamps: three sources, not one

A spec reading a seeded row's dates hits one of three different answers, depending what wrote the
row:

- **Whatever this spec itself creates, live, over the API** — ordinary wall-clock time, exactly as
  production behaves. Nothing here changes that.
- **A SEEDED row** (a product, a user, a locale entry — anything built through
  `identityOf`, `src/infrastructure/persistence/factories.ts`, with no explicit override) —
  `createdAt` is the row's own PINNED `_id`'s embedded timestamp (`objectId.getTimestamp()`), not
  the moment `scenario:apply` happened to run. `scenarios/accounts.ts`'s comment on
  `SEED_OWNER_ID` — "its leading bytes date it to February 2024" — is this, stated at the call site.
- **A FLOW-PRODUCED row** (an order and its whole trail — payment, shipment, reservation, stock
  movement, audit rows) — `createdAt` starts as the real wall-clock moment the flow drove it at
  boot, then `backdate.ts` moves it into the past. That backdated value is what
  `captureDatabase()` freezes into the in-memory copy, so a restore's `insertMany` writes it back
  UNCHANGED — the shop's order history does not slide forward with every replay, only when the
  process restarts and the flows run again.

## Related pages

- [Demo profile](./demo-profile.md) — the control surface this feeds, and the named accounts
- [Data](../reference/data.md#the-demo-records) — the file-by-file reference
- [`payments-provider-port`](../modules/payments-provider-port.md) — the fake PSP the magic methods above belong to
- [`locales`](../modules/locales.md) — the module the coverage grid above exercises
