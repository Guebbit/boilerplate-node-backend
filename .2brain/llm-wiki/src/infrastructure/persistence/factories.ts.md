---
source: src/infrastructure/persistence/factories.ts
sha256: c1ab18dff7e4b44e1f65268c7e8fd4fb1325861119260c90f9b6a44fa01fa576
generated_at: 2026-10-14T08:09:13.739495+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/factories.ts

## Purpose

Shared factory-identity helpers that every module's `factories.ts` would otherwise repeat: generating a `_id`, deriving `createdAt`/`updatedAt` from it, and typing the overrides bag a factory accepts. Exists so modules only declare their *own* domain fields and delegate the universal identity trio here.

## Key elements

- **`FactoryIdentity`** (interface) — the three optional fields every factory override accepts: `id?`, `createdAt?`, `updatedAt?`.
- **`OverridesFor<TEntity>`** (type) — derives a fully-typed overrides bag from the contract entity: `FactoryIdentity & Partial<Omit<TEntity, …>>`, with `deletedAt` widened to `Date | string`. Renaming a field in `openapi.yaml` turns stale call sites red at `tsc` time.
- **`toDate`** — converts a wire-format date (ISO string or `Date`) to `Date`; passes `undefined` through untouched (pairs with `stripUndefined` to keep absent keys truly absent).
- **`toObjectId`** — returns a fresh `Types.ObjectId` when `id` is `undefined`, otherwise parses the supplied string.
- **`identityOf`** — takes a `FactoryIdentity` and produces `{ _id, createdAt, updatedAt }`. An unstated `createdAt` is read from the ObjectId's embedded timestamp; `updatedAt` defaults to `createdAt` unless explicitly supplied.

## Relationships

- **`src/modules/{locales,orders,products,users}/factories.ts`** — each module factory imports `identityOf`, `toDate`, and `OverridesFor` from this file to build its entity documents, adding only its own domain fields on top.
- **`tests/unit/infrastructure/persistence/factories.test.ts`** — unit-tests the exported functions in isolation.
- **`@infrastructure/object-guards`** (referenced in docs) — `stripUndefined` is the complementary utility that removes `undefined` keys so `deletedAt` is either present or fully absent in the written document.

## Notes

- Schemas must use `timestamps: true` so Mongoose *preserves* a supplied `createdAt` on insert rather than overwriting it; this file's helpers are designed around that behaviour.
- `ObjectId.getTimestamp()` has **second** granularity: identities created in the same tick share an identical `createdAt`. Tests that sort or paginate by `createdAt` must supply explicit dates.
- `deletedAt` is deliberately widened to `Date | string` in `OverridesFor` because the wire format carries ISO strings while Mongoose stores `Date`s. The helpers do not enforce that the three date fields are logically ordered—tests that care about ordering state them explicitly.
