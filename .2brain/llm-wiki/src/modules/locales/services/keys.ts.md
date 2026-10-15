---
source: src/modules/locales/services/keys.ts
sha256: c5f81b7cdfe5829132cdd5ded93aacf893c43ae7da4cdb7371f2226672b140b2
generated_at: 2026-10-15T10:45:53.647269+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/keys.ts

## Purpose

Pure, database-free validation and tree-building utilities that decide whether a translation key can be stored and rendered. It is shared internally by `entries.ts` and `messages.ts`; neither file "owns" it. No separate `domain/` folder is warranted because the rules are simple enough to live here.

## Key elements

- **`buildMessageTree`** (exported) — Converts an array of flat `{ key, value }` rows into the nested object shape served by `GET /locales/{locale}`. Throws on a key/group collision (an invariant that write paths are expected to prevent upstream).
- **`findUnsafeKeySegment`** (exported) — Returns the first segment that is empty (`a..b`, `a.`) or in the deny-list (`__proto__`, `constructor`, `prototype`), or `undefined` if the key is safe.
- **`findKeyCollision`** (exported) — Given a key and an iterable of others, returns the first key that is a strict dotted prefix of (or is a strict dotted prefix of) it. An *identical* key is deliberately **not** a collision.
- **`findBatchCollision`** (exported) — Wraps `findKeyCollision` to return the first colliding pair `[a, b]` within a single key batch.
- **`findDuplicateKey`** (exported) — Returns the first key that appears more than once in a batch.
- **`rejectUnusableKey`** (exported) — Combines the above into a single gate: returns a 422 `ResponseReject` for unsafe segments, a 409 `ResponseReject` for collisions, or `undefined` if the key is acceptable.
- **`UNSAFE_KEY_SEGMENTS`** (internal) — The `Set` of forbidden segments.
- **`setLeaf` / `descend`** (internal helpers) — Single-step tree-walk primitives used by `buildMessageTree`.

## Relationships

- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `t` to produce localized error messages in `rejectUnusableKey`.
- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type to shape HTTP error responses.
- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` to distinguish group nodes from leaf strings during tree construction.
- **`src/modules/locales/repository.ts`** — Imports the `EntryInput` type (only `key` and `value` fields are picked for `buildMessageTree`).
- **`src/modules/locales/services/entries.ts`** — Consumes `rejectUnusableKey`, `findBatchCollision`, and `findDuplicateKey` during create/update flows.
- **`src/modules/locales/services/messages.ts`** — Consumes `buildMessageTree` to shape the response for the read endpoint.
- **`src/modules/locales/services/index.ts`** — Re-exports the public API of this module.

## Notes

- **Collision vs. duplicate:** `findKeyCollision` explicitly skips identical keys. Callers must use `findDuplicateKey` (or check equality themselves) for the duplicate case; conflating the two produces the wrong status code and message.
- **Null-prototype trees:** `buildMessageTree` builds from `Object.create(null)` so a stored `__proto__` segment becomes an ordinary own property rather than reassigning the prototype. The `UNSAFE_KEY_SEGMENTS` deny-list is a belt-and-suspenders guard at the *storage* level.
- **`rejectUnusableKey` does not validate renderability:** By design, entries may add keys no dictionary defines, or keys belonging to a frontend keyspace the API cannot see. The checks guard only against *damage* (unstorable keys, collisions), not against typos.
- **`buildMessageTree` throws on collision:** This is intended as an invariant-violation signal. All write paths are expected to reject colliding pairs *before* reaching this function; the throw exists so a regression surfaces loudly rather than silently overwriting data.
