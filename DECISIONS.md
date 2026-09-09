# Decisions

Implementation choices made while finishing `TRANSLATION_UPGRADE.md` (phases 6-9) and
`PRODUCT_WRITE_REWORK.md` (steps 5-6), where the design docs left a genuine gap. Format: problem,
options considered, decision and why.

## Where the order-snapshot resolver lives

**Problem:** Freezing an order line's product text into the buyer's locale needs
`runWithLocale`/`resolveTranslations` from `@infrastructure/i18n`, plus `mongoose.Types`. The
obvious home was `src/modules/orders/domain/`, alongside `totals.ts`.

**Options:** (a) `domain/snapshot.ts`; (b) `services/snapshot.ts`.

**Decision:** (b). The domain tier is lint-restricted (`eslint.config.ts`) to plain TypeScript
with no infrastructure or Mongoose imports — a domain file importing `runWithLocale` or
`mongoose.Types.ObjectId` fails `boundaries`/`no-restricted-imports` outright. `services/` is
where `crud.ts` already imports `@infrastructure/i18n`, so `src/modules/orders/services/snapshot.ts`
is the correct tier for a resolver that has to reach infrastructure.

## Hydrated document vs. lean object in the snapshot resolver

**Problem:** `resolveSnapshotProducts` needs a plain object with `_id` intact (not `.toJSON()`'s
`id: string`, which would make Mongoose mint a fresh subdocument `_id` and break
`items.product._id` order search). But its two callers hand it different shapes:
`productRepository.findByIdRaw` (used by `orders/services/crud.ts`) returns a **lean** plain
object with no `.toObject()` method; cart's checkout products (via `populate()`) are **hydrated**
Mongoose documents.

**Options:** (a) require callers to normalize first; (b) have the resolver detect the shape.

**Decision:** (b). The resolver checks `typeof product.toObject === 'function'` and only calls it
when present, otherwise uses the object as-is — both paths preserve `_id` as an `ObjectId` either
way, and callers don't have to know which repository method they used.

## Admin item-rewrite locale, with no buyer context available

**Problem:** `orderService.update()`'s `data.items` rewrite branch (an admin PATCH replacing order
lines) has no `CallerContext` — unlike `create()` (has `context.locale`) and checkout (has
`user.locale`) — so there's no obvious "buyer language" to resolve the replacement lines into.

**Options:** (a) thread a `CallerContext`/locale through `update()`'s signature; (b) fall back to
the deployment default; (c) reuse the order's own existing snapshot locale.

**Decision:** (c) — `order.items[0]?.locale ?? getDefaultLocale()`. An admin editing an order's
line items is amending a purchase, not re-selling it in a new language; keeping the language the
order was originally placed in is the least surprising behavior, and it needs no signature change
to a function three other call sites already share.

## Demo seeders can't call `productService.writeCreate`

**Problem:** `PRODUCT_WRITE_REWORK.md` step 6 asks the demo seeders to go through "the new write
surface" instead of writing `title`/`description` directly through the repository. But
`productService.writeCreate` validates its body against `zodProductCreateSchema`/`CreateProductBody`
(generated from `POST /products`), which has **no `id` field** — it always mints a fresh
`ObjectId`. The demo dataset needs deterministic, pinned ids: `db:seed` upserts idempotently by
`_id`, and `demo/orders.ts`/`demo/cart.ts`/`demo/wishlist.ts` address specific catalogue rows by
their known id.

**Options:** (a) add an `id` escape hatch to the create contract for seeding only; (b) call
`planTranslations`/`writeTranslations` — the two primitives `writeCreate` itself composes —
directly, keeping the product row's own `upsertById` write (which already pins `_id`).

**Decision:** (b). No contract change for a seeding-only concern. `demo/products.ts` writes the
product row via `upsertById` as before (pinned id, fixed dates), then validates and writes its
translation rows through the same `planTranslations`/`writeTranslations` port `writeCreate` uses —
the closest a caller with its own id can get to "the write surface" without a contract change.

## The demo seeding race: `locales` before `products`

**Problem:** `db/demo/index.ts` and `scripts/demo/export-dataset.ts` both seeded every module
concurrently (`Promise.all(Object.values(demoModules).map(m => m.seed()))`). Once `products`
writes translation rows during its own seed, `planTranslations` requires the locale (`en`, `it`)
to already exist as an **active** `locales` row — a race could run `products.seed()` before
`locales.seed()` had written those rows.

**Decision:** added `seedAllDemoModules()` to `demo/index.ts`: awaits `locales.seed()` first, then
runs every other module's `seed()` in parallel. Both `db/demo/index.ts` and
`scripts/demo/export-dataset.ts` now call this instead of their own inline `Promise.all`, so the
ordering is decided in exactly one place.

## Byte-stability of seeded translation rows

**Problem:** Once product seeding started writing real `translations` rows through the live write
surface, `npm run seed:export --check` (part of `npm run complete`) started failing: two
independent reseeds of a throwaway database produced different `db/demo/demo-data.json` output.
Root causes, found by diffing two runs: (1) `upsertEntityLocale`'s `findOneAndUpdate` stamps each
translation row's `createdAt`/`updatedAt` with the real clock, and mints a fresh, random `_id` at
insert — neither is ever supplied by the write surface's own API; (2)
`writePlannedTranslations`'s derived-index-column write (`translationRepository.updateDerivedColumn`)
re-touches the **product's own row** with an ordinary, timestamps-enabled `updateOne`, silently
bumping its `updatedAt` past the fixed value `upsertById` had already set.

**Options:** (a) add a caller-supplied id/timestamp override to the production translation port,
for every caller; (b) fix it entirely in the demo layer, after the real write completes.

**Decision:** (b) — production behavior is correct as-is (a translation write SHOULD stamp the
real clock and mint a fresh id; a caller writing its own document SHOULD see its `updatedAt` move).
`demo/products.ts` now, after `writeTranslations` resolves: re-pins the product's own `updatedAt`
back to the fixture's value with a `{ timestamps: false }` `updateOne`; and replaces each
just-written translation row (delete + reinsert, since `_id` is immutable) under a deterministic
id — an MD5 of `product:<entityId>:<locale>` truncated to 24 hex characters — and the same fixed
timestamp every other demo fixture's rows carry. Verified stable across three independent
`export-dataset.ts --check` runs.

## Frontend: `resetAll()` is per-composable, not global

**Problem:** `TRANSLATION_UPGRADE.md` phase 8 says the locale guard should call "the toolkit's
existing `resetAll()`" after a language switch, for every locale-sensitive module's store. But
`@guebbit/vue-toolkit` exposes `resetAll()` as a method on each store the toolkit's
`defineStore`-wrapping produces (as `useProfileStore().resetAll()` already does) — there is no
toolkit-wide "reset everything" export, and resetting every store indiscriminately would also wipe
unrelated state (auth/session) on a language switch.

**Decision:** `AppModule` (`src/kernel/registry.ts`) gained two optional fields:
`localeSensitive?: boolean` and `resetOnLocaleChange?: () => void`. A module that holds product
text wires its own store's `resetAll()` into the callback (called lazily, inside the closure —
Pinia isn't installed yet when manifests are evaluated). The kernel's
`collectLocaleSensitiveResets()` gathers every registered callback; the locale guard
(`src/app/guards/locale-choice.ts`) calls them all, once, only when the locale actually changed.
Wired: `products` (`resetAll`), `orders` (`resetAll` — order lines embed resolved product text),
`cart` (a narrower `resetProductTitles()` — only the title-join cache, never cart contents
themselves). `wishlist` needed nothing: `WishlistItem` carries no text of its own, it joins
through cart's cache.

## A `translator` route-access level

**Problem:** The frontend router only distinguished `guest | auth | admin`, with `admin` driven by
`isAdmin` (`ability.can('delete', 'Product')`). A `translator` has `translations.read`/`.manage`
but never `products.manage`, so gating the new translation screens behind `admin` would lock a
translator out of the door built for them.

**Decision:** added `'translator'` to `RouteAccess`, plus `canReadTranslations`/
`canManageTranslations` computeds in `src/infrastructure/session.ts`, and extended
`canAccess`/`enforceRouteAccess` to recognize it.

## Where the admin translation screen lives

**Problem:** The generic `/translations/{entityType}/{id}` door has no natural single owner on the
frontend — it's product content today, but the backend explicitly built it entity-agnostic for
future CMS/email-template use.

**Decision:** the screen (`EntityTranslations.vue`) lives in the `locales` module — the module
that owns the generic resource on the backend too — at route `locales/translations/:entityType/:id`,
reached via a "Translations" button on `ProductEdit.vue` (visible to `isAdmin || canReadTranslations`).
It discovers its field set from the union of keys already present in the fetched rows rather than
a per-entity client-side schema — the accepted trade-off of a screen that has to stay generic
across entity types it doesn't know about yet.
