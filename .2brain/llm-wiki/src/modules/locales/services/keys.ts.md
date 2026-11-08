---
source: src/modules/locales/services/keys.ts
sha256: 864d13dda7da35b39cb363053287001fac11298dfb71e2e15ef4013651a806e3
generated_at: 2026-11-08T06:25:43.677287+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/keys.ts

## Purpose

Pure, database-free validation and tree-building rules for locale translation keys. It decides whether a key is storable (length, forbidden segments, prefix collisions) and converts flat dotted-key entries into the nested object shape the `GET /locales/{locale}` endpoint returns. It exists as a shared module inside `services/` so that `entries.ts` and `messages.ts` apply identical rules without duplicating logic.

## Key elements

- **`buildMessageTree(entries)`** — Splits each dotted key into segments and walks a null-prototype tree, creating intermediate groups via `descend` and writing leaves via `setLeaf`. Throws on a string/group collision (an invariant the write paths are expected to prevent).
- **`isKeyLengthValid(key)`** — Returns `true` when the trimmed key is 1–200 characters.
- **`findUnsafeKeySegment(key)`** — Returns the first empty or forbidden segment (`__proto__`, `constructor`, `prototype`) in a dotted key, or `undefined`.
- **`findKeyCollision(key, others)`** — Returns a key from `others` that is a strict dotted prefix of `key` (or vice-versa). Identical keys are *not* collisions.
- **`findBatchCollision(keys)`** — Finds the first pair in a batch that cannot coexist in one tree.
- **`findDuplicateKey(keys)`** — Finds the first key that appears twice in a batch.
- **`rejectUnusableKey(key, others)`** — Orchestrates the two user-facing checks in order: unsafe segment → **422** (`LOCALE_ENTRY_KEY_INVALID`), then prefix collision → **409** (`LOCALE_ENTRY_KEY_COLLISION`). Returns a `ResponseReject` or `undefined` when the key passes.
- **`setLeaf` / `descend`** — Internal helpers that enforce the "a segment is either a string leaf or a group, never both" invariant while building the tree.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type to shape the 422/409 error payloads in `rejectUnusableKey`.
- **`src/infrastructure/i18n/index.ts`** — Imports the `t` function to produce localized error messages for invalid and colliding keys.
- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` to distinguish group nodes from leaf strings during tree construction.
- **`src/modules/locales/repository.ts`** — Imports the `EntryInput` type; `buildMessageTree` accepts `Pick<EntryInput, 'key' | 'value'>[]`.
- **`src/modules/locales/services/entries.ts`** — Consumes the exported validators and `rejectUnusableKey` when processing single-entry create/update requests.
- **`src/modules/locales/services/messages.ts`** — Consumes `buildMessageTree` to assemble the nested payload returned by the read endpoint, and the collision helpers for bulk writes.
- **`src/modules/locales/services/index.ts`** — Barrel re-export; makes the key-rule functions available to the rest of the module.

## Notes

- All tree nodes are created with `Object.create(null)`, so even a stored `__proto__` segment would produce an ordinary own property rather than mutating `Object.prototype`. The `UNSAFE_KEY_SEGMENTS` guard is a second, write-time line of defence.
- **Collision ≠ duplicate.** Two identical keys are a duplicate (different message, different caller expectation); a key that is a strict dotted prefix of another is a collision. `findKeyCollision` explicitly skips the equality case.
- `buildMessageTree` *throws* on a string/group collision rather than silently overwriting. The write paths are expected to call `findKeyCollision` first; reaching the throw means an invariant was violated behind the API (covered by unit tests).
- The module deliberately does **not** validate that a key maps to an existing dictionary entry or belongs to a known frontend keyspace. Typos save cleanly and simply render nowhere; the checks here guard against structural damage only.
- `rejectUnusableKey` checks unsafe segments before collisions, so a caller sees a 422 (their input is malformed) before a 409 (their input conflicts with stored data).
