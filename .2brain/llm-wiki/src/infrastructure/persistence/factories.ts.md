---
source: src/infrastructure/persistence/factories.ts
sha256: b082bd372645c907ad5edf063fa45326557fa4c8ef47ea9beac3f8d48f0f4ca3
generated_at: 2026-09-23T17:49:58.963184+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/factories.ts

## Purpose

Shared primitives that every module's `factories.ts` would otherwise duplicate: identity-field handling (`_id`, `createdAt`, `updatedAt`), a generic overrides-bag type, and a `stripUndefined` helper. Exists so module factories stay thin and the identity/date/id conventions are defined in exactly one place.

## Key elements

- **`FactoryIdentity`** — interface for the three identity fields (`id?`, `createdAt?`, `updatedAt?`) that every factory accepts on top of its entity-specific fields.
- **`OverridesFor<TEntity>`** — type alias that composes `FactoryIdentity` with `Partial<Omit<TEntity, …>>` plus a widened `deletedAt?: Date | string`. Derives the overrides bag from the contract entity so renames in `openapi.yaml` surface at `tsc` time.
- **`stripUndefined`** — removes keys whose value is `undefined` from a plain object. Prevents a caller's explicit `undefined` from shadowing a Mongoose schema default when overrides are spread over factory defaults.
- **`toDate`** — passes `undefined` through; otherwise coerces a wire-format `Date | string` to `Date`.
- **`toObjectId`** — returns a fresh `Types.ObjectId` when `id` is omitted, or parses a pinned 24-char hex string.
- **`identityOf`** — takes a `FactoryIdentity` and returns `{ _id, createdAt, updatedAt }`. Derives `createdAt` from the ObjectId's embedded timestamp when unstated; `updatedAt` defaults to `createdAt`.

## Relationships

- **`src/infrastructure/http/request.ts`** — `stripUndefined` is reused by `readInput` there to keep `||`-merged request objects from carrying explicit `undefined`s into a Mongoose filter.
- **`src/modules/*/factories.ts`** (addresses, locales, orders, products, users) — each module factory imports `OverridesFor`, `identityOf`, `toDate`, `toObjectId`, and `stripUndefined` from this file to build its seed/test documents without re-implementing identity logic.
- **`tests/unit/infrastructure/persistence/factories.test.ts`** — unit-tests the helpers exported here in isolation.

## Notes

- `identityOf` reads `createdAt` off `ObjectId.getTimestamp()`, which is **second-granular**. Factories called within the same second will share an identical `createdAt`; any test that sorts or paginates by that date must supply its own values.
- The module deliberately does **not** validate that `createdAt ≤ updatedAt` or that the three dates are mutually consistent. A test that cares about ordering is responsible for supplying explicit dates.
- `stripUndefined` is intentionally _not_ named `compact` to avoid confusion with lodash's array-only, falsy-dropping `_.compact`.
- `deletedAt` is widened to `Date | string` in `OverridesFor` because the wire carries ISO strings while Mongoose stores `Date`s; `toDate` is the expected coercion at the call site.
