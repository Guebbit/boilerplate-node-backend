# src/infrastructure/persistence/fixtures.ts

## Purpose

Shared building blocks for every module's `fixtures.ts` factory: generating an `_id`, pinning `createdAt`/`updatedAt` timestamps, and typing the overrides bag. Without this module each module would repeat the same identity/timestamp/override plumbing. Timestamps are deliberately fixed at fixture-definition time (not generated at seed-run time) so the committed seed artefact is reproducible.

## Key elements

- **`FactoryIdentity`** — interface with optional `id`, `createdAt`, `updatedAt`; the minimal identity fields every factory accepts.
- **`OverridesFor<TEntity>`** — derives a typed overrides bag from a contract entity: `FactoryIdentity` + `Partial<Omit<TEntity, …>>` + widened `deletedAt?: Date | string`. A rename in `openapi.yaml` surfaces as a `tsc` error at every stale call site.
- **`stripUndefined(source)`** — removes keys whose value is `undefined`. Prevents a caller's `{ stock: undefined }` from shadowing a Mongoose `default:` when a factory spreads overrides.
- **`toDate(value)`** — `Date | string | undefined → Date | undefined`; normalises wire-format ISO strings to Mongoose `Date` objects, passing `undefined` through so the key stays absent.
- **`toObjectId(id?)`** — `undefined → new Types.ObjectId()`, string → pinned `Types.ObjectId`.
- **`identityOf(fields)`** — builds `{ _id, createdAt, updatedAt }` from a `FactoryIdentity`. An omitted `createdAt` is extracted from the ObjectId's embedded 4-byte timestamp; `updatedAt` defaults to `createdAt`.

## Relationships

- **Module fixtures** (`account`, `cart`, `locales`, `orders`, `products`, `users`, `wishlist` — each `fixtures.ts`): every module factory consumes `identityOf`, `OverridesFor`, `toDate`, and `stripUndefined` instead of re-implementing the identity/timestamp/override logic locally.
- **`src/infrastructure/http/request.ts`**: shares the `stripUndefined` idiom; `readInput` in that file needs the same "drop explicit `undefined`" behaviour to keep `||`-merged request objects from leaking `undefined` into Mongoose filters.
- **`tests/unit/infrastructure/persistence/fixtures.test.ts`**: unit-tests the helpers in this module in isolation.

## Notes

- `stripUndefined` is intentionally **not** named `compact` to avoid confusion with lodash's array-only, falsy-dropping `compact`.
- ObjectId's leading 4 bytes are a **second-granular** timestamp. Fixtures created in the same tick share an identical `createdAt`; any test that sorts or paginates by `createdAt` must supply its own dates.
- `deletedAt` is widened to `Date | string` in `OverridesFor` because the wire contract carries ISO strings while Mongoose stores `Date` objects; the wire never distinguishes "absent" from "explicitly null", so the factory either omits the key (via `stripUndefined`) or provides a concrete date.
- This module does **not** guarantee the three dates are logically ordered (`createdAt ≤ updatedAt`). A test that needs a specific ordering must state the dates it wants.
