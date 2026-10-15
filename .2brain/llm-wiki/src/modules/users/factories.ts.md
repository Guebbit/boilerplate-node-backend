---
source: src/modules/users/factories.ts
sha256: 7ba836a109c9cfb919b6ae3f39db769cbfe62d9ec093a05d1c17f067b7b269f9
generated_at: 2026-10-15T12:07:54.119894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/factories.ts

## Purpose

Builds user-row fixtures for seed accounts (`scenarios/users.ts`) and any test that needs a person. It deliberately leaves `imageUrl`, `locale`, `active`, and `verifiedAt` to the schema defaults in `./model` so a seeded row mirrors what the schema actually produces. The password stays plaintext through the builder; the model's pre-save hook handles hashing before the row reaches Mongo.

## Key elements

- **`PLAIN_PASSWORD`** – Exported constant (`'Fx7$qLwZ9m!'`) used as the default fixture password. Chosen to satisfy the real signup policy while avoiding the breached-password list. Tests import it so the login string always matches what the builder wrote.
- **`UserOverrides`** – Type describing what a caller may pin. Derived from the generated `User` type via `Omit<…,'verifiedAt'|'role'>`, then extended with `password`, `twoFactorMethods`, `twoFactorBackupCodes`, `twoFactorBackupCodeSalt`, and a re-added `verifiedAt` (Date-or-string).
- **`UserFixture`** – Type alias: `Partial<UserDocument> & { _id }`, i.e. a document ready for `userRepository.create`.
- **`makeUser`** – The builder. Accepts an optional `UserOverrides` object, spreads `identityOf` for id/timestamps, sets fixed defaults (`username`, `email`, `password`), then spreads `stripUndefined(fields)` with date conversions via `toDate`. Returns a `UserFixture`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** – Provides `identityOf`, `toDate`, and the `OverridesFor<T>` generic that `UserOverrides` is built from.
- **`src/infrastructure/object-guards.ts`** – Provides `stripUndefined`, used to prevent absent keys from overriding schema defaults with explicit `undefined`.
- **`src/modules/users/model.ts`** – Source of `TwoFactorMethodRecord` and `UserDocument` types. Also owns the pre-save hook that hashes the plaintext password and applies schema defaults this factory intentionally omits.
- **`src/types/index.ts`** – Source of the `User` type used in the `UserOverrides` derivation.
- **`scenarios/users.ts`** – Primary consumer; builds seed accounts via `makeUser`.
- **`scenarios/flows/shop-history.ts`** – Consumes user fixtures when setting up shop-history scenario state.
- **`src/modules/users/tests/unit/factories.test.ts`** – Unit-tests `makeUser` output shape and defaulting behavior.
- **`src/modules/users/tests/unit/schema-contract.test.ts`** – Validates that the `Omit` choices in `UserOverrides` stay aligned with the actual schema contract.
- **`src/modules/users/tests/integration/repository.test.ts`** – Uses `makeUser` fixtures when exercising `userRepository` round-trips.
- **`src/modules/users/tests/factories.ts`** – Test-layer wrapper that re-exports or augments the builders here for test-suite convenience.

## Notes

- **Never write a hashed password here.** The model's pre-save hook performs hashing; a pre-hashed value would bypass it and drift from the hook's logic.
- **`role` is intentionally absent** from both the document and `UserOverrides`. Roles live on the membership document; a fixture that needs one must call `assignRole` / `assignDefaultRole` from `@modules/access` separately.
- **`stripUndefined` matters.** Without it, an omitted override would spread `undefined` over the schema default, corrupting the row.
- **`PLAIN_PASSWORD` is not arbitrary.** It was selected to pass the real `CreateUserBody` password policy while being absent from `breached-passwords/list.txt` (e.g. `Password1!` is composition-valid *and* listed, making it unsuitable).
