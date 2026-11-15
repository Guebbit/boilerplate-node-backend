---
source: src/modules/locales/services/keys.ts
sha256: a9623bd1159b3a8b577e690d6c44bf769be7a5fc49fcd425358a850d2455610e
generated_at: 2026-11-14T20:22:00.376304+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/keys.ts

## Purpose

Shared validation and tree-building logic for locale translation keys. It answers "can this key be stored and rendered?" with concrete rejections (not booleans), and converts flat dotted-key entries into the nested object shape the `GET /locales/{locale}` endpoint serves. Pure, database-free, and owned by nobody — both `entries.ts` and `messages.ts` import from it.

## Key elements

- **`buildMessageTree(entries)`** — folds an array of `{ key, value }` rows into a null-prototype nested object. Throws on a key-collision invariant break (should be unreachable through the API).
- **`isKeyLengthValid(key)`** — checks trimmed key is 1–200 chars (`KEY_MAX_LENGTH = 200`).
- **`findUnsafeKeySegment(key)`** — returns the first segment that is empty or in `{ __proto__, constructor, prototype }`, or `undefined` if the key is safe.
- **`findKeyCollision(key, others)`** — returns the first `other` where one key is a strict dotted-prefix of the other. Identical keys are *not* collisions (they are duplicates).
- **`findBatchCollision(keys)`** — first `[key, collidingKey]` pair within a single batch.
- **`findDuplicateKey(keys)`** — first key that appears more than once in a batch.
- **`rejectUnusableKey(key, others)`** — orchestrates the checks in order (unsafe segment → collision) and returns a `ResponseReject` (422 or 409) or `undefined`. Does **not** validate that the key actually maps to a renderable message.
- **`UNSAFE_KEY_SEGMENTS`** (module-private) — the forbidden-segment set.
- **`setLeaf` / `descend`** (module-private) — internal tree-walk helpers used only by `buildMessageTree`.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `generateReject` and the `ResponseReject` type used by `rejectUnusableKey`.
- **`src/infrastructure/i18n/index.ts`** — imports `t` to localize the two error messages returned by `rejectUnusableKey`.
- **`src/infrastructure/object-guards.ts`** — imports `isPlainObject` for the type-narrowing checks inside `setLeaf` and `descend`.
- **`src/modules/locales/repository.ts`** — imports the `EntryInput` type (only its `key` and `value` fields are used by `buildMessageTree`).
- **`src/modules/locales/services/entries.ts`** and **`messages.ts`** — both consume the exported validators and `buildMessageTree`; neither re-exports them.
- **`src/modules/locales/services/index.ts`** — barrel re-export for the `services/` directory.

## Notes

- All tree nodes are created via `Object.create(null)`, so a stored `__proto__` segment becomes an ordinary property rather than a prototype mutation. The `UNSAFE_KEY_SEGMENTS` check is a belt-and-suspenders guard on the *storage* side.
- "Collision" and "duplicate" are deliberately distinct: collision = one key is a dotted-prefix of another; duplicate = two identical keys. `rejectUnusableKey` covers only collision; duplicate detection is the caller's job via `findDuplicateKey`.
- `rejectUnusableKey` intentionally does **not** verify that the key resolves to a defined translation — entries may carry keys for front-end keyspace or as-yet-undefined messages.
- The 200-char `KEY_MAX_LENGTH` constant mirrors the API-level bound on `CreateLocaleEntryRequest.key`; keep them in sync if either changes.
