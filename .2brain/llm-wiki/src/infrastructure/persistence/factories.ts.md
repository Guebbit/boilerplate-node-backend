---
source: src/infrastructure/persistence/factories.ts
source_sha256: c1ab18dff7e4b44e1f65268c7e8fd4fb1325861119260c90f9b6a44fa01fa576
context_sha256: 6f35f2a060f3759c18264eb5d79d7f0d39babe75d73613848a412d2031fa8998
generated_at: 2026-11-22T03:02:23.722403+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/factories.ts

## Purpose
Shared building blocks for the per-module test/seed factories. It supplies the pieces every module's `factories.ts` would otherwise repeat: an `_id`, a `createdAt`/`updatedAt` pair, and the type of the overrides bag.

## Key elements
- **`FactoryIdentity`** (interface): optional `id` (24-char hex), `createdAt` and `updatedAt` (`Date | string`). Every factory accepts these on top of its own fields.
- **`OverridesFor<TEntity>`** (type): `FactoryIdentity` plus `Partial` of the contract entity, omitting `id`, `createdAt`, `updatedAt` and `deletedAt`. `deletedAt` is re-added as `Date | string`. Because it derives from the entity, a field renamed in `openapi.yaml` breaks stale call sites at `tsc` time.
- **`toDate(value)`**: converts a wire date (`Date | string`) to a `Date`. `undefined` passes through unchanged.
- **`toObjectId(id?)`**: returns a fresh `Types.ObjectId` when `id` is omitted, otherwise one built from the given string.
- **`identityOf(identity)`**: returns `{ _id, createdAt, updatedAt }`. `createdAt` defaults to the ObjectId's embedded timestamp, and `updatedAt` defaults to `createdAt`.

## Relationships
- The module factories (`src/modules/locales/factories.ts`, `src/modules/orders/factories.ts`, `src/modules/products/factories.ts`, `src/modules/users/factories.ts`) are the consumers. They build on these helpers and the `OverridesFor` type.
- `tests/unit/infrastructure/persistence/factories.test.ts` is the unit test for this file.
- The `toDate` doc comment says it is paired with `stripUndefined` from `@infrastructure/object-guards`. The file does not import it.

## Notes
- Schemas use `timestamps: true`. A supplied `createdAt` is kept on insert, and `updatedAt` matches it unless supplied. The values therefore reach the stored document as given, not only in `build()`/`new Model()`.
- `getTimestamp()` has one-second granularity. Rows built in the same second share an identical default `createdAt`, so a test that sorts or paginates by it must pass its own dates.
- The file does not check that `createdAt`, `updatedAt` and the id's timestamp are consistent with each other. A test that cares about ordering must state the dates itself.
- `toDate` combined with `stripUndefined` keeps `deletedAt` either present or missing, never present-and-undefined.
- `id` is normally omitted, so a fresh id is generated. Pinning it is for the seed dataset.
