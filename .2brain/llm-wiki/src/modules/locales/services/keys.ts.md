---
source: src/modules/locales/services/keys.ts
sha256: 864d13dda7da35b39cb363053287001fac11298dfb71e2e15ef4013651a806e3
generated_at: 2026-10-29T04:23:49.462333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/keys.ts

## Purpose

Centralizes every rule that decides whether a translation key is storable and renderable. Shared by `entries.ts` and `messages.ts` within the locales services; neither file "owns" it. Pure functions, no database access.

## Key elements

- **`buildMessageTree(entries)`** — Converts a flat list of `{ key, value }` pairs (dotted keys) into the nested object shape served by `GET /locales/{locale}`. Uses null-prototype objects throughout. Throws on a key-collision invariant breach (should be unreachable if `findKeyCollision` was enforced upstream).
- **`isKeyLengthValid(key)`** — Returns `true` when the trimmed key is 1–200 characters.
- **`findUnsafeKeySegment(key)`** — Returns the first segment that is empty or one of `__proto__` / `constructor` / `prototype`, or `undefined` if the key is safe.
- **`findKeyCollision(key, others)`** — Returns the first key in `others` that is a strict dotted prefix of `key` (or vice versa). Identical keys are **not** collisions.
- **`findBatchCollision(keys)`** — Returns the first `[key, collision]` pair within a single batch.
- **`findDuplicateKey(keys)`** — Returns the first key that appears twice in a batch.
- **`rejectUnusableKey(key, others)`** — Orchestrates the two checks above and returns a `ResponseReject` (422 for unsafe segment, 409 for collision) or `undefined` if the key passes.
- **`setLeaf` / `descend`** — Internal helpers used by `buildMessageTree`; throw descriptive `Error`s on group/string conflicts.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — imports `t` to build localized error messages inside `rejectUnusableKey`.
- **`src/infrastructure/http/response.ts`** — imports `generateReject` and the `ResponseReject` type used as the return type of `rejectUnusableKey`.
- **`src/infrastructure/object-guards.ts`** — imports `isPlainObject` for the group-vs-string checks in `setLeaf` and `descend`.
- **`src/modules/locales/repository.ts`** — imports the `EntryInput` type to shape the parameter of `buildMessageTree`.
- **`src/modules/locales/services/entries.ts`** — sibling consumer; calls the key-validation exports before persisting.
- **`src/modules/locales/services/messages.ts`** — sibling consumer; calls `buildMessageTree` to assemble the nested response.
- **`src/modules/locales/services/index.ts`** — service barrel; re-exports the public surface of this module.

## Notes

- All tree nodes are created with `Object.create(null)`, so a stored `__proto__` segment becomes an ordinary property rather than mutating the prototype. The `UNSAFE_KEY_SEGMENTS` check is a belt-and-suspenders guard for storage-time rejection.
- `findKeyCollision` deliberately skips identical keys; a duplicate is reported by `findDuplicateKey` and produces a different error message to the caller.
- `rejectUnusableKey` does **not** verify that the key is actually defined in any dictionary or frontend keyspace. A typo saves cleanly and simply renders nowhere — the checks here guard only against unstorable or colliding keys.
- The 200-char max (`KEY_MAX_LENGTH`) is declared here and mirrored in the `CreateLocaleEntryRequest.key` schema; keep them in sync.
