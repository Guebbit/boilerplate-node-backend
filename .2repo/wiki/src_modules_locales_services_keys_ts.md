# src/modules/locales/services/keys.ts

## Purpose

Defines the validation rules and tree-building logic for translation keys. It decides whether a key is safe to store, detectable as a collision or duplicate, and renders it into the nested object shape the API serves. All functions are pure and database-free; the file is shared by `entries.ts` and `messages.ts` within the `services/` folder.

## Key elements

- **`buildMessageTree(entries)`** — Flattens dotted `key`/`value` pairs into a nested null-prototype object. Throws on key-group collision (a key is both a string leaf and a branch parent), signalling a broken invariant.
- **`findUnsafeKeySegment(key)`** — Returns the first segment that is empty or in the `UNSAFE_KEY_SEGMENTS` set (`__proto__`, `constructor`, `prototype`).
- **`findKeyCollision(key, others)`** — Returns the first `other` that is a strict dotted prefix of `key` (or vice versa). Identical keys are *not* collisions.
- **`findBatchCollision(keys)`** — Scans a batch for the first pair that cannot coexist in one tree.
- **`findDuplicateKey(keys)`** — Returns the first key appearing twice in a batch.
- **`rejectUnusableKey(key, others)`** — Orchestrates the checks above and returns a `ResponseReject` (422 for unsafe segment, 409 for collision) or `undefined` when the key passes.
- **`isPlainObject`** (internal) — Type guard narrowing to non-array, non-null objects.
- **`UNSAFE_KEY_SEGMENTS`** (internal) — `Set` of segments that would corrupt a plain-object tree via prototype assignment or name an unaddressable node.

## Relationships

- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies the `t()` function used to produce localised error messages inside `rejectUnusableKey`.
- **`src/infrastructure/http/response.ts`** — Supplies `generateReject` and the `ResponseReject` type returned by `rejectUnusableKey`.
- **`src/modules/locales/repository.ts`** — Provides the `EntryInput` type whose `key`/`value` fields `buildMessageTree` consumes.
- **`src/modules/locales/services/entries.ts`** — Calls `rejectUnusableKey`, `findDuplicateKey`, and `findBatchCollision` during write paths.
- **`src/modules/locales/services/messages.ts`** — Calls `buildMessageTree` to produce the nested payload served by `GET /locales/{locale}`.
- **`src/modules/locales/services/index.ts`** — Barrel file that groups the services module; does not import `keys.ts` directly (it is internal to the folder).

## Notes

- Deliberately lives in `services/` rather than a `domain/` folder: the i18n admin surface is small enough that a separate module would be ceremony.
- `buildMessageTree` builds from `Object.create(null)` nodes, so a stored `__proto__` segment would create an ordinary property instead of mutating a prototype — but `findUnsafeKeySegment` still rejects such keys at the write boundary.
- **Collision ≠ duplicate.** Identical keys are duplicates (409, different message); a dotted-prefix relationship is a collision. `rejectUnusableKey` only checks collisions; callers handle duplicates via `findDuplicateKey` / `findBatchCollision`.
- `rejectUnusableKey` does **not** verify that a key maps to a renderable translation. Keys that no dictionary defines (or that belong to a tenant's private keyspace) are valid inputs by design.
- `buildMessageTree` throwing is treated as an invariant violation (the API should have already rejected the pair); unit tests assert the throw.
