---
source: src/modules/users/factories.ts
sha256: d8a41112cdb1b7abc1bbb7badfb8bef2ce2829a58690339544273b7cef00109e
generated_at: 2026-10-29T06:12:42.098162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/factories.ts

## Purpose

Builder for user fixtures used by seed accounts (`scenarios/users.ts`) and tests. It intentionally omits schema-defaulted fields (`active`, `locale`, `verifiedAt`, `imageUrl`) so a seeded row reflects what the Mongoose schema actually does. The password is kept plaintext here; hashing is delegated to the model's pre-save hook.

## Key elements

- **`PLAIN_PASSWORD`** (`'Fx7$qLwZ9m!'`) — exported constant so login tests type the same string the builder writes. Deliberately absent from `shared/rules/breached-passwords.txt`.
- **`UserOverrides`** — the set of fields a caller may pin. Derived from `OverridesFor<User>` (from `@infrastructure/persistence/factories`) with schema-owned fields removed, plus internal-only fields (`purchaseHold`, `twoFactorMethods`, `purgeAt`, etc.) that never appear on the wire. `role` is excluded by design.
- **`UserFixture`** — return shape: `Partial<UserDocument> & { _id }`.
- **`makeUser(fields?: UserOverrides): UserFixture`** — spreads defaults (`username`, `email`, `password`), applies `identityOf` for `_id`/timestamps, normalises date fields via `toDate`, strips `undefined` via `stripUndefined`, then overlays caller-supplied fields.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — provides `identityOf`, `toDate`, and the `OverridesFor<T>` utility type that `UserOverrides` is built from.
- **`src/infrastructure/object-guards.ts`** — provides `stripUndefined`, used to drop absent fields before the object is returned.
- **`src/modules/users/model.ts`** — defines `UserDocument`, `PurchaseHoldRecord`, `TwoFactorMethodRecord` (all imported here). Its pre-save hook is what hashes the plaintext password the factory writes.
- **`src/types/index.ts`** — source of the `User` contract type that `OverridesFor<User>` derives from.
- **`scenarios/users.ts`** — primary consumer; calls `makeUser` to seed accounts.
- **`scenarios/flows/shop-history.ts`** — consumer for purchase-hold fixtures.
- **`src/modules/users/tests/unit/factories.test.ts`** — unit-tests `makeUser` output shape and defaults.
- **`src/modules/users/tests/unit/schema-contract.test.ts`** — asserts the fixture fields align with the `User` contract.
- **`src/modules/users/tests/integration/repository.test.ts`** — feeds `makeUser` output into `userRepository.create`.
- **`src/modules/users/tests/factories.ts`** — thin test-local wrapper around this module.

## Notes

- **Password is plaintext by contract.** Never pre-hash it here; the model's pre-save hook owns that step. Writing a hash in a fixture would drift from the hook.
- **No `role` field.** Roles live on the membership document, not the user. Fixtures that need a role call `assignRole` / `assignDefaultRole` from `@modules/access` separately.
- **`UserOverrides` omits `verifiedAt`, `analyticsConsentAt`, `purchaseHold`, `purgeAt`, `role`** from the base `OverridesFor<User>` and re-declares them with narrower / date-typed shapes — don't widen these back to strings when extending.
- **`stripUndefined` is applied after the spread**, so a caller passing `undefined` for an optional field won't produce an explicit `undefined` key in the returned object.
