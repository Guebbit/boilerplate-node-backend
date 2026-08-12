# Deletability test

The acceptance test the modular architecture exists to pass:

> Deleting a domain is `rm -rf` of one folder plus removing one line from a registry, and
> `complete:check` stays green.

Run **2026-08-12**, against the working tree as it stands. This is the measurement, not a plan: every
number below came out of a real run, and the commands to repeat it are at the bottom.

**How it was run.** Two throwaway copies of the working tree outside the repo, with `node_modules`
hard-linked in. Nothing in this repository or in the paired frontend was modified — the copies were
deleted afterwards. The tree at the time was the uncommitted modular migration, all nine modules
enabled.

**The baseline it started from** — everything green:

|                |                                                               |
| -------------- | ------------------------------------------------------------- |
| tests          | 1318 unit · 102 cross-cutting · 66 integration · 140 contract |
| `openapi.yaml` | 37 paths · 93 schemas · 3063 lines                            |
| lint           | clean                                                         |

---

## Part 1 — Removing three domains

`rm -rf src/modules/{products,cart,orders}`, then the registry. It splits into two stages, because
the code and the contract are two registries and they fail differently.

### Stage 1 — the folder and the line

Delete the three folders, delete three imports and three array entries from `src/modules.ts`.

```
tsc --noEmit → 6 errors in 3 files
src/**  0 files
db/**   0 files
```

**§0's test is met where it matters.** Not `app.ts`, not `src/app/`, not `kernel/`, not
`infrastructure/`, not one seed, not one migration. The application tier genuinely does not know
which domains exist.

The three files that break at this stage:

| File                                                             | Why                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tests/integration/concurrency/cart-races.test.ts`               | asserts a race between cart, orders and users. Correct — no modules, no race               |
| `tests/contract/request-contract.test.ts:42`                     | imports `@modules/products/tests/factory` to build its fixtures                            |
| `tests/unit/infrastructure/adapters/mailer-templates.test.ts:20` | imports `@modules/{account,feedback,orders}/emails` and hard-codes five template filenames |

Suites failing at stage 1: **4 unit** (`metrics-overview`, `migration-model-indexes`,
`seed-fixtures`, `mailer-templates`), **5 cross-cutting**.

### Stage 2 — the contract

Fragmentation (phases 6a–6c) added registries of its own, so the honest count is **not** one line.
Three more section lists name domains:

| Registry                  | File                                   |
| ------------------------- | -------------------------------------- |
| `SECTION_ORDER`           | `scripts/contracts/openapi.ts`         |
| `ANALYTICS_SECTION_ORDER` | `scripts/contracts/analyticsEvents.ts` |
| `SEED_SECTION_ORDER`      | `scripts/contracts/seedIdentities.ts`  |

Leaving any of them stale is a hard error naming the missing file, which is the designed behaviour
and it works:

```
Error: [analytics-events] src/infrastructure/observability/analytics-events.ts
  names a fragment that does not exist:
  src/modules/products/analytics.fragment.ts
  Deleting a domain means deleting its entry from the bundle's section list too —
  and mirroring both in the paired repo.
```

After trimming all three and re-bundling:

|         | before | after |
| ------- | ------ | ----- |
| paths   | 37     | 24    |
| schemas | 93     | 64    |
| lines   | 3063   | 1920  |

`/products`, `/cart` and `/orders` operations remaining: **0**. Spectral: **0 errors**, 5
`oas3-unused-component` warnings — `Order`, `CartItem`, `ProductIdParam`, `ProductIdPathParam`,
`UserIdParam`. Those are the shared components 6b deliberately kept in `contracts/shared/`; with
their only referrers gone they are orphans. Warnings, not errors, and correct as far as the tool can
tell — but they are the thing a fourth deletion would trip over.

### `npm run contracts:bundle` works once, then never again

The sharpest finding of the run, and it is not in tests — it is in the tooling.

`scripts/contracts/generateCollections.ts:51` imports `seedProducts` and `seedOrders` **by name**
from `db/seeds/seed-identities.ts`, which is itself a bundle the same command rewrites. So:

1. `npm run contracts:bundle` — generator runs first, still sees the old seed file, succeeds; the
   bundler then rewrites `seed-identities.ts` without products or orders.
2. `npm run contracts:bundle` again — `TypeError: undefined is not iterable` at
   `generateCollections.ts:158`, and `tsc` reports five errors in that file. Permanently.

Run in the other order (bundler first, generator second) it never succeeds at all. And because
`tests/cross-cutting/contract-bundles.test.ts` imports the generator, that suite stops running too —
one type error in a script takes out the test that guards every bundle.

The generator needs the seed dataset the way the collections need it — as _whatever identities
exist_, not as three named exports.

---

## What broke, by class

Sixteen files break in total — 14 under `tests/`, one co-located spec under
`src/modules/observability/tests/`, one script. No production file in `src/**` or `db/**` is among
them. They fall into five groups, and only two of the sixteen are correct.

### 1. Canaries pinned to the current module count — seven, the largest class

Every sweep-based guard carries a canary so an empty sweep cannot read as a pass. Each one states
its floor as a literal calibrated against the ecommerce build, so deleting domains fails the guard
that exists to prove the guard still works:

| Guard                                                     | Asserts                              | After |
| --------------------------------------------------------- | ------------------------------------ | ----- |
| `tests/cross-cutting/audit-actions.test.ts:57`            | ≥ 6 modules with an audit vocabulary | 3     |
| `tests/cross-cutting/locale-namespaces.test.ts:53`        | ≥ 7 modules shipping copy            | 4     |
| `tests/cross-cutting/module-test-boundaries.test.ts:62`   | ≥ 8 modules with specs               | 6     |
| `tests/cross-cutting/every-controller-catches.test.ts:73` | > 30 controllers                     | 21    |
| `tests/unit/db/seed-fixtures.test.ts:78`                  | ≥ 5 fixture images                   | 2     |
| `tests/unit/db/migration-model-indexes.test.ts:139`       | ≥ 6 registered models                | 3     |
| `tests/contract/request-sources.test.ts:247`              | > 30 mounted routes                  | 30    |

**The fix is the same for all seven, and it is not "lower the number".** A canary should assert the
sweep is _consistent with the disk_, not that the disk holds a particular build: the count of modules
with an `audit.ts` found by the sweep should equal the count of `audit.ts` files that exist, and the
floor should be ≥ 1. As written, every one of these is a second copy of `src/modules.ts` expressed as
an integer, in a file that never mentions a domain and therefore looks domain-free.

### 2. Central specs that reach into a domain — four

Phase 5 moved specs by ownership; these were missed because none of them _looks_ domain-shaped.

| Spec                                                          | Names                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/infrastructure/adapters/mailer-templates.test.ts` | `@modules/{account,feedback,orders}/emails`, plus five `.ejs` filenames                                              |
| `tests/unit/infrastructure/observability/analytics.test.ts`   | 13 references to deleted event names (`PRODUCT_VIEWED`, `CART_ITEM_ADDED`, `CHECKOUT_COMPLETED`, `ORDER_CREATED`, …) |
| `tests/integration/product-multipart-write.test.ts`           | drives `POST /products` — every case now 404                                                                         |
| `tests/contract/request-contract.test.ts:42`                  | imports `@modules/products/tests/factory` for its fixtures                                                           |

The first two are the same shape: a spec that legitimately tests a _shared mechanism_ (the email
template directory, the analytics emitter) reaches for domain data as its sample. Its assertions
belong where they are; its fixtures belong to the modules. The third is simply a products spec that
never moved — the multipart write it exercises is products' controller, and it should sit in
`src/modules/products/tests/`.

Worth noting separately: **the email templates themselves are central**. `views/templates-emails/`
still holds `email-order-confirm.ejs` after orders is deleted, and nothing notices. A module's
templates are as much its property as its locales.

### 3. One module's spec naming its siblings — one

`src/modules/observability/tests/unit/metrics-overview.test.ts:32` imports `@modules/account/module`,
`@modules/cart/module` and `@modules/orders/module` to populate the metrics registry before asserting
the rows. That is legal under the boundary rule (a sibling's manifest is one of the four allowed
imports), and it is arguably correct — those rows only exist when those modules do. But it means the
observability module cannot be built without three named siblings, which is exactly the coupling
`dependsOn` is supposed to make visible, and it is not in `dependsOn`.

### 4. Tooling — one file, wide blast radius

`scripts/contracts/generateCollections.ts`, described above. It takes
`tests/cross-cutting/contract-bundles.test.ts` with it, which is how a script's type error becomes a
missing guard over all seven bundles.

### 5. Correct breaks — two

| File                                               | Why it should break                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/concurrency/cart-races.test.ts` | there is no race between modules that do not exist                                                                                                   |
| `tests/unit/scripts/spec-identity.test.ts`         | reports the seven shared bundles as FORKED against the paired frontend — deleting a domain **is** a two-repo change, and this is the guard saying so |

`request-contract.test.ts` is no longer in this group. Before phase 6 it broke because the spec still
described the deleted domains; now the spec shrinks with them and its only failure is the test
factory it imports (class 2).

---

## Part 2 — Adding a domain

The other half of §0, run on a clean copy: scaffold an `events` module and count what it costs.

**One folder:**

```
src/modules/events/
    module.ts                 name · basePath · routes
    routes.ts                 one GET
    controllers/get-events.ts
    openapi/paths.yaml        the operation
    openapi/schemas.yaml      the one schema it references
```

**Two lines** — one in `src/modules.ts`, one in `SECTION_ORDER`.

**Then bundle**, and there is an ordering trap:

- `npm run contracts:bundle` **fails**: the collection generator refuses a fragment path that is not
  yet in `openapi.yaml`, and tells you to run `npm run contracts:bundle` — the command that just
  failed.
- `npx tsx scripts/bundle-contracts.ts openapi` first, _then_ `npm run contracts:bundle`, works. The
  spec has to exist before the collections can be derived from it.

That is a one-line fix in the runner (bundle the spec before generating collections) and it is the
only friction in the whole add path.

**Everything else is automatic.** Nothing was touched to mount the route, register the module,
validate dependencies, or produce API-client entries — the run generated four dev fragments
(`bruno.yml`, `insomnia.yml`, `mockoon.routes.json`, `mockoon.tree.json`) unasked.

**Result:** `tsc` clean, spectral clean, all 7 bundles up to date, cross-cutting **13/13 suites,
106 tests green**, contract 140 green, integration 66 green, lint clean. The single failure was
`spec-identity` — the paired repo has not received the seven regenerated files, which is the correct
two-repo step and not a defect.

---

## Verdict

**Met, for the tier that matters.** `src/**` and `db/**` break in zero files when three of nine
domains are deleted; the application tier is genuinely domain-agnostic, and adding a domain is one
folder and two lines.

**Not met for the honest headline.** "One folder plus one line" is really:

1. `rm -rf src/modules/<name>/`
2. one line from `src/modules.ts`
3. its entry from up to three `*_SECTION_ORDER` lists
4. re-bundle, and copy the seven shared files to the paired frontend

Steps 3 and 4 are inherent to contracts being shared across two repos — they are the price of D3,
not a leak. What _is_ a leak is the residue in `tests/` and `scripts/`: seven canaries that encode
the current module count, three central specs that use a domain as sample data, and one generator
that imports two named seed exports.

### Ranked fix list

|     | Fix                                                                                                                     | Why first                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `generateCollections.ts` — take the seed identities as a set, not as `seedProducts`/`seedOrders`                        | breaks the bundler irrecoverably and takes `contract-bundles.test.ts` with it   |
| 2   | The seven canaries — assert sweep-vs-disk, not a literal                                                                | largest class, and each one currently hides a domain list in a domain-free file |
| 3   | `mailer-templates` and `analytics` specs — keep the mechanism assertions central, move the sample data into the modules | central specs failing on a deleted domain                                       |
| 4   | `product-multipart-write.test.ts` → `src/modules/products/tests/`                                                       | it is a products spec                                                           |
| 5   | `views/templates-emails/*` → the modules that render them                                                               | nothing notices an orphaned template today                                      |
| 6   | `bundle-contracts` before `gen-collections` in the `contracts:bundle` script                                            | the add-path ordering trap                                                      |
| 7   | `metrics-overview.test.ts` — discover the modules that register metrics instead of naming three                         | correct as written, but it is an undeclared dependency                          |

None of these is load-bearing for the architecture. All seven are in test and script code, and every
one of them is the same mistake in a different costume: **a count or a name that was easier to write
down than to derive.**

---

## Re-running it

```bash
SB=$(mktemp -d)                                   # outside the repo
rsync -a --exclude node_modules --exclude .git ./ "$SB"/
cp -al node_modules "$SB"/node_modules            # same filesystem, or copy it
cd "$SB"

rm -rf src/modules/{products,cart,orders}
# drop three imports + three array entries from src/modules.ts
npx tsc --noEmit                                  # stage 1: src/** and db/** must be 0

# drop them from SECTION_ORDER, ANALYTICS_SECTION_ORDER, SEED_SECTION_ORDER
npm run contracts:bundle                          # stage 2
npx spectral lint openapi.yaml --ruleset spectral.yaml
npm test
```

Anything that fails and is not on the list above is new coupling that arrived after 2026-08-12.
