# src/modules/locales/services/keys.ts

## Purpose

Defines all validation rules that determine whether a translation key is storable and renderable. It is a pure, database-free shared utility within `services/` — owned by neither `entries.ts` nor `messages.ts`, but consumed by both. Its subdomain is `generic`, which is why it lives here rather than under `domain/`.

## Key elements

- **`buildMessageTree(entries)`** — Converts flat dotted-key rows into the nested object shape served by `GET /locales/{locale}`. Uses null-prototype objects throughout. Throws (→ 500) if a key is both a string and a group at the same path; callers are expected to prevent this via the collision checks below.
- **`findUnsafeKeySegment(key)`** — Returns the first segment that is empty or in `UNSAFE_KEY_SEGMENTS` (`__proto__`, `constructor`, `prototype`), or `undefined` if the key is safe.
- **`findKeyCollision(key, others)`** — Returns the first key in `others` that is a strict dotted prefix of `key` (or vice versa). Identical keys are *not* collisions (they are duplicates).
- **`findBatchCollision(keys)`** — Wraps `findKeyCollision` to find the first conflicting *pair* within a single batch.
- **`findDuplicateKey(keys)`** — Returns the first key that appears more than once in a batch.
- **`rejectUnusableKey(key, others)`** — The primary entry point. Checks unsafe segments (→ 422) then collisions (→ 409) and returns a `ResponseReject`, or `undefined` if the key passes. Uses `t()` for localized error messages.
- **`UNSAFE_KEY_SEGMENTS`** (private) — The deny-list of segment names blocked to prevent prototype-pollution vectors.
- **`isPlainObject`** (private) — Type guard used by `buildMessageTree` to distinguish intermediate nodes from leaf strings.

## Relationships

- **`@infrastructure/http/response`** — Imports `generateReject` and the `ResponseReject` type to shape 422/409 rejection payloads.
- **`@infrastructure/i18n`** (index / context) — Imports `t` for the localized error strings embedded in rejections.
- **`../repository`** — Imports the `EntryInput` type (specifically its `key`/`value` fields) to type the input of `buildMessageTree`.
- **`./entries.ts`** — Calls the validation helpers (`rejectUnusableKey`, `findBatchCollision`, `findDuplicateKey`) before persisting rows.
- **`./messages.ts`** — Calls `buildMessageTree` to assemble the nested response, and may use collision helpers for read-path consistency.
- **`./index.ts`** — Barrel re-export surface for the rest of the module.

## Notes

- All tree nodes are created with `Object.create(null)`, so a stored `__proto__` segment would become a harmless own property rather than mutating `Object.prototype`. The unsafe-segment check exists to reject the key *up front* with a reason, not because the tree itself is vulnerable.
- `findKeyCollision` intentionally excludes identical keys. Duplicates are a separate concern handled by `findDuplicateKey`; conflating them would produce a misleading error message.
- The file explicitly does **not** verify that a key is actually rendered by any dictionary. A typo'd key saves cleanly and renders nowhere. This is by design: entries can introduce brand-new keys, and frontend-tenant keys live in a separate repository this API cannot inspect.
- `buildMessageTree` throwing on a collision is an invariant-broken signal (500), not a user-error signal. All write paths are expected to call the collision checks first; the throw is a safety net asserted by unit tests.
