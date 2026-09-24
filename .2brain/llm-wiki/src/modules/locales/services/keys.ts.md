---
source: src/modules/locales/services/keys.ts
sha256: de9cefa38b45137922e331d27b3a9c20d3fc475e1c4adcc6839940c2990fb4cd
generated_at: 2026-09-23T18:51:55.798254+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/keys.ts

## Purpose

Defines every rule that decides whether a translation key can be stored or rendered. It provides pure, database-free key validation (unsafe segments, prefix collisions, duplicates) plus the flat-to-nested tree builder that `GET /locales/{locale}` serves. Internal to `services/`; deliberately not promoted to a `domain/` folder because an i18n admin has no rules worth one.

## Key elements

- **`buildMessageTree(entries)`** – Converts an array of `{ key, value }` rows into the nested object shape the read endpoint returns. Uses null-prototype objects (`Object.create(null)`) at every node. Throws on a string/group collision (e.g. `products.list` and `products.list.title` both present).
- **`findUnsafeKeySegment(key)`** – Returns the first segment that is empty (`a..b`, trailing dot) or in the blocklist (`__proto__`, `constructor`, `prototype`), or `undefined` if the key is safe.
- **`findKeyCollision(key, others)`** – Returns the first key in `others` that is a strict dotted-prefix of `key` (or vice-versa). Identical keys are _not_ treated as collisions here.
- **`findBatchCollision(keys)`** – Scans a batch for the first pair that cannot coexist (prefix relationship); returns `[key, collision]` or `undefined`.
- **`findDuplicateKey(keys)`** – Returns the first key that appears twice in a batch, or `undefined`.
- **`rejectUnusableKey(key, others)`** – Combined gate: runs `findUnsafeKeySegment` then `findKeyCollision`; returns a `ResponseReject` (422 or 409 with an i18n'd message) or `undefined` if the key passes.
- **`isPlainObject`, `setLeaf`, `descend`** – Internal helpers for tree construction; not exported.

## Relationships

- **`@infrastructure/i18n`** (`context.ts` / `index.ts`) – Imports `t` to build localised error messages inside `rejectUnusableKey`.
- **`@infrastructure/http/response`** – Imports `generateReject` and the `ResponseReject` type used as the return type of `rejectUnusableKey`.
- **`../repository`** – Imports the `EntryInput` type (only `key` and `value` fields) for `buildMessageTree`'s parameter.
- **`services/entries.ts` / `services/messages.ts`** – Both consume the validation helpers (`rejectUnusableKey`, `findBatchCollision`, `findDuplicateKey`) and `buildMessageTree`; neither owns them.
- **`services/index.ts`** – Barrel that re-exports from this module so callers can import from `services/` directly.

## Notes

- **Collision ≠ duplicate.** `findKeyCollision` deliberately skips identical keys. A duplicate is answered by `findDuplicateKey` and produces a different error message to the caller.
- **Null-prototype everywhere.** `buildMessageTree` builds every node via `Object.create(null)`, so a stored `__proto__` segment (if one slipped past validation) would create an ordinary property rather than mutating a prototype.
- **`rejectUnusableKey` does NOT verify renderability.** A typo'd key (one no dictionary defines) passes validation and stores cleanly; it simply renders nowhere. The checks guard against structural damage only.
- **`UNSAFE_KEY_SEGMENTS` includes `constructor` and `prototype`** in addition to `__proto__`, even though the latter is the only one that can actually pollute via assignment—defense in depth for segments no client could address.
- The file is marked `@module` with no named exports beyond the public helpers listed above; `isPlainObject`, `setLeaf`, and `descend` are intentionally unexported.
