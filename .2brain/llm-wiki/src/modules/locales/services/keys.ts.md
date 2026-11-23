---
source: src/modules/locales/services/keys.ts
source_sha256: a9623bd1159b3a8b577e690d6c44bf769be7a5fc49fcd425358a850d2455610e
context_sha256: 31dd3777ed52125c4dc2e138e862462c63b94c69ee420abd18f2b7b58002b58b
generated_at: 2026-11-22T05:47:51.467820+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/keys.ts

## Purpose
Holds the key rules for translation keys: everything that decides whether a dotted key can be stored and rendered. It is internal to `services/` and shared by `entries.ts` and `messages.ts`, with no single owner. It is pure and database-free. Its rules return a rejection rather than a verdict, so they stay in `services/`.

## Key elements
- `buildMessageTree(entries)`: converts flat dotted `{key, value}` rows into the nested object that `GET /locales/{locale}` serves. It builds from null-prototype objects and throws an `Error` on a string/group collision.
- `isKeyLengthValid(key)`: true when a trimmed key is 1–200 characters (`KEY_MAX_LENGTH`, which mirrors `CreateLocaleEntryRequest.key`).
- `findUnsafeKeySegment(key)`: returns the first segment that is empty or is `__proto__`, `constructor` or `prototype`. Returns `undefined` if the key is fine.
- `findKeyCollision(key, others)`: returns a key from `others` that is a strict dotted prefix of `key`, or has `key` as one. An identical key is not a collision.
- `findBatchCollision(keys)`: returns the first colliding pair `[key, existing]` within one batch.
- `findDuplicateKey(keys)`: returns the first key a batch names twice.
- `rejectUnusableKey(key, others)`: returns a `ResponseReject` or `undefined`. It gives 422 with `LOCALE_ENTRY_KEY_INVALID` for an unsafe segment, and 409 with `LOCALE_ENTRY_KEY_COLLISION` for a collision. Messages come from `t('locales.error-key-invalid' | 'locales.error-key-collision')`.
- Private helpers `setLeaf`, `descend` and `UNSAFE_KEY_SEGMENTS` back the tree building and segment checks.

## Relationships
- `src/infrastructure/http/response.ts`: supplies `generateReject` and the `ResponseReject` type used by `rejectUnusableKey`.
- `src/infrastructure/i18n/index.ts`: supplies `t`, used for the rejection messages.
- `src/infrastructure/object-guards.ts`: supplies `isPlainObject`, used by `setLeaf` and `descend` to tell groups from strings.
- `src/modules/locales/repository.ts`: the `EntryInput` type (`key`, `value`) is the row shape `buildMessageTree` takes.
- `src/modules/locales/services/entries.ts` and `messages.ts`: sibling services that share these rules. This file does not import them.
- `src/modules/locales/services/index.ts` and `src/infrastructure/i18n/context.ts`: no direct use is visible in this file.

## Notes
- A collision is a strict dotted-prefix relation (`products.list` vs `products.list.title`). An identical key is a duplicate, which is a separate answer with a separate message.
- `buildMessageTree` throws on a collision because the write paths already reject such pairs. Reaching the throw means an invariant broke elsewhere. `src/modules/locales/tests/unit/service.test.ts` asserts it.
- `others` depends on the caller. For a create it is everything already stored. For a bulk replace it is only the rest of the batch.
- `rejectUnusableKey` does not check that the key is one anything renders. A typo saves cleanly and renders nowhere. This is by design, since entries may add keys a dictionary never defined or belong to a frontend app's own keyspace.
- `isKeyLengthValid` expects an already trimmed key. It does not trim.
