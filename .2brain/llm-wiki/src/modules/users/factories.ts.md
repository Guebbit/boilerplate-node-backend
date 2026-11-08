---
source: src/modules/users/factories.ts
sha256: d8a41112cdb1b7abc1bbb7badfb8bef2ce2829a58690339544273b7cef00109e
generated_at: 2026-11-08T08:46:00.386195+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/factories.ts

## Purpose

Builds user fixtures (partial `UserDocument` objects) for seed accounts and tests. It intentionally omits fields the Mongoose schema defaults (`imageUrl`, `locale`, `active`, `verifiedAt`) so a seeded row reflects what the schema actually does rather than a factory's guess. Passwords stay plaintext through the builder; the model's pre-save hook handles hashing.

## Key elements

- **`PLAIN_PASSWORD`** (`const`) — Shared fixture password (`Fx7$qLwZ9m!`). Satisfies the real signup password policy and is deliberately **not** a listed entry in `shared/rules/breached-passwords.txt`. Exported so tests that log in use the exact string the builder wrote.
- **`UserOverrides`** (`type`) — What a caller may pin when calling `makeUser`. Derived from the generated `User` type via `OverridesFor`, then re-opened for fields the response contract hides (e.g. `password`, `twoFactorMethods`, `authenticatorEnabledAt`, `purgeAt`, `deletedBy`). Explicitly omits `role` (lives on memberships, not the user document).
- **`UserFixture`** (`type`) — `Partial<UserDocument> & { _id }`; the shape `makeUser` returns, ready for `userRepository.create`.
- **`makeUser`** (`const` function) — Accepts a `UserOverrides` (default `{}`), spreads `identityOf` defaults, sets a baseline `username`/`email`/`password`, then merges caller fields after normalizing date fields via `toDate` and stripping `undefined` values. Returns a `UserFixture`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Imports `identityOf`, `toDate`, and the `OverridesFor` helper type.
- **`src/infrastructure/object-guards.ts`** — Imports `stripUndefined` to remove `undefined` keys before returning the fixture.
- **`src/modules/users/model.ts`** — Imports `PurchaseHoldRecord`, `TwoFactorMethodRecord`, and `UserDocument` for typing the fixture. The model's pre-save hook is responsible for hashing the plaintext `password` this file writes.
- **`src/types/index.ts`** — Imports the generated `User` type used to derive `UserOverrides`.
- **`scenarios/users.ts`** — Consumes `makeUser` to build seed accounts.
- **`src/modules/users/tests/factories.ts`** — Wraps or re-exports this factory for test suites.
- **`src/modules/users/tests/unit/factories.test.ts`** — Unit-tests `makeUser` output shape.
- **`src/modules/users/tests/integration/repository.test.ts`** — Uses fixtures produced here against the real repository.

## Notes

- **No `role` field.** Roles live on membership documents, not the user document. A fixture needing a role must call `assignRole`/`assignDefaultRole` from `@modules/access` against the returned `_id`.
- **Password is always plaintext in the output.** Writing a pre-hashed value here would drift from the model's pre-save hook.
- **`PLAIN_PASSWORD` is intentionally a composition-valid string that does *not* appear in the breached-password list**, so fixtures can pass the real signup validation path.
- Date fields (`verifiedAt`, `analyticsConsentAt`, `deletedAt`, `twoFactorEnabledAt`, `termsAcceptedAt`) accept both `Date` and ISO-string inputs; `toDate` normalizes them before the fixture is returned.
