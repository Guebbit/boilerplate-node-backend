---
source: src/infrastructure/persistence/factories.ts
sha256: c1ab18dff7e4b44e1f65268c7e8fd4fb1325861119260c90f9b6a44fa01fa576
generated_at: 2026-11-08T03:42:45.086165+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/factories.ts

## Purpose

Shared building blocks that every module-level `factories.ts` would otherwise duplicate: the identity triple (`_id`, `createdAt`, `updatedAt`), the generic overrides type, and small coercion helpers. Exists so that the "boring 90%" of a Mongoose factory is written once and the modules only supply their domain-specific fields.

## Key elements

- **`FactoryIdentity`** — interface for the three identity fields every factory accepts (`id?`, `createdAt?`, `updatedAt?`). Dates are wire-format (`Date | string`).
- **`OverridesFor<TEntity>`** — generic type alias: `FactoryIdentity` intersected with `Partial` of the entity (minus the identity fields, plus a widened `deletedAt?`). Deriving it from the contract entity means a rename in `openapi.yaml` breaks stale call sites at compile time.
- **`toDate(value)`** — `Date | string | undefined → Date | undefined`. Passes `undefined` through untouched so `stripUndefined` (in `@infrastructure/object-guards`) can drop the key entirely, keeping `deletedAt` either present or absent.
- **`toObjectId(id?)`** — `string | undefined → Types.ObjectId`. Mints a fresh ObjectId when the argument is omitted.
- **`identityOf(identity: FactoryIdentity)`** — returns `{ _id, createdAt, updatedAt }`. When `createdAt` is omitted it is read from the ObjectId's embedded 4-byte timestamp (`getTimestamp()`); `updatedAt` defaults to `createdAt` unless explicitly supplied.

## Relationships

- **`src/modules/{locales,orders,products,users}/factories.ts`** — each module factory imports `OverridesFor`, `identityOf`, and typically `toDate` to construct its Mongoose document, replacing the repeated identity boilerplate this file provides.
- **`tests/unit/infrastructure/persistence/factories.test.ts`** — unit-tests the coercion and defaulting logic (`toObjectId`, `identityOf`, `toDate`).
- **`@infrastructure/object-guards`** (referenced in a doc comment) — provides `stripUndefined`, which pairs with `toDate`'s `undefined` pass-through to ensure absent dates leave no key behind.

## Notes

- `getTimestamp()` has **second granularity**: two identities generated in the same tick share an identical `createdAt`. Tests that sort or paginate by `createdAt` must supply explicit dates rather than relying on the ObjectId-derived default.
- The module deliberately does **not** enforce ordering among the three dates (`createdAt ≤ updatedAt`). Any test that cares about temporal ordering is responsible for stating it.
- `deletedAt` is widened to `Date | string` in `OverridesFor` because the wire format uses ISO strings while Mongoose stores `Date` objects; `toDate` is the conversion point.
- `timestamps: true` on the Mongoose schema is what allows a supplied `createdAt`/`updatedAt` to survive an `insert` instead of being overwritten — a behavioral detail of the schema, not of this file, but one the factory output relies on.
