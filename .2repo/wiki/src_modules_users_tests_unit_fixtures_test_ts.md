# src/modules/users/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeUser` account-fixture builder. They pin down the contract that downstream feature tests rely on: what defaults are produced, which fields can be overridden, how falsy values are handled, and how ID/date fields are derived.

## Key elements

- **`describe('makeUser')`** — single suite with seven assertions covering:
  - Default document shape (`_id` is an `ObjectId`, `username`, `email`).
  - `password` is stored as the shared `PLAIN_PASSWORD` constant (not pre-hashed), so the model's pre-save hook hashes it exactly once.
  - Arbitrary field overrides (e.g. `username`, `email`).
  - Unspecified optional fields (`admin`, `verified`, `deletedAt`, `tokens`) are *absent* (checked via `Object.hasOwn`), letting Mongoose schema defaults apply.
  - Explicit `false` values are preserved rather than dropped.
  - `deletedAt` accepts an ISO-8601 string and is converted to a `Date` instance.
  - Supplying an `id` hex string sets both `_id` and derives `createdAt` from the ObjectId's embedded timestamp.
- **`HEX`** — module-level constant (`'65dc8a99604c307b702b5ccc'`) used as a sample ObjectId hex string.

## Relationships

- **`src/modules/users/fixtures.ts`** — source of `makeUser` and `PLAIN_PASSWORD`. Every assertion in this file exercises that module's public API; a breaking change there will surface here first.
- **`mongoose`** — `Types.ObjectId` is used to validate `_id` type and to extract the embedded timestamp from the hex string.

## Notes

- The test that checks `password === PLAIN_PASSWORD` also asserts the constant is non-empty, guarding against a silently empty credential.
- The "omits unspecified fields" test uses `Object.hasOwn` specifically — the fixture must not attach `undefined` values; Mongoose schema defaults (e.g. `admin: false`) should apply at save time, not in the fixture object.
- The `id` → `createdAt` test assumes `makeUser` derives the creation timestamp from the ObjectId's 4-byte seconds prefix. Changing that convention breaks the test.
