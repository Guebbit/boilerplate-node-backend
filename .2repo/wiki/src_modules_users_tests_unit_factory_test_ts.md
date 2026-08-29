# src/modules/users/tests/unit/factory.test.ts

## Purpose

Unit tests for the `makeUser` account-fixture builder. They lock in the contract that downstream tests (auth, authorization, soft-delete flows) rely on: correct defaults, safe override semantics, and the plaintext-password invariant that makes the model's pre-save hashing hook work.

## Key elements

- **`describe('makeUser', …)`** — the single test suite; every `it` block exercises one aspect of the factory's output.
- **`HEX`** — a fixed 24-char ObjectId hex string used to verify that passing an `id` override both sets `_id` and back-fills `createdAt` from the ObjectId's embedded timestamp.
- **Password tests** — assert `makeUser().password` equals the `PLAIN_PASSWORD` constant and that the constant is non-empty; this is the invariant that prevents double-hashing.
- **Override / omission tests** — confirm that partial overrides replace defaults, that unspecified fields are absent (letting Mongoose schema defaults apply), and that explicitly `false` values are preserved rather than dropped.
- **`deletedAt` conversion test** — an ISO-string input is expected to come back as a `Date` instance.

## Relationships

- **`src/modules/users/factory.ts`** — the sole production import. Provides `makeUser` (the function under test) and `PLAIN_PASSWORD` (the shared plaintext credential used here and in sign-in tests).

## Notes

- **Plaintext is intentional.** The fixture must store the password unhashed so the model's pre-save hook performs the single hash. If a hash were stored here, the hook would hash it again and every login test would fail in a misleading way.
- **Falsy vs. missing.** The factory distinguishes `undefined` (field omitted → schema default applies) from `false` (explicit value → kept). The test suite guards this distinction for `admin` and `verified`.
- **`id` override is a string.** The factory accepts a hex string, constructs the `ObjectId`, and derives `createdAt` from its embedded timestamp. Callers don't pass a `Date` for `createdAt` when they supply `id`.
