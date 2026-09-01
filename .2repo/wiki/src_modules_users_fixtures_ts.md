# src/modules/users/fixtures.ts

## Purpose

Builder for user fixtures used by `./demo` and any test that needs a person. It deliberately omits schema-managed fields (`imageUrl`, `locale`, `admin`, `active`, `verified`, `tokens`) so that `demo-data.json` records what the Mongoose schema actually defaults, rather than baking those values in at fixture time.

## Key elements

- **`PLAIN_PASSWORD`** – Exported constant (`'Password1!'`) used as the default password for any fixture where the caller doesn't pin one. Satisfies the real signup password policy so fixtures can exercise actual signup flows. Exported so login tests type the same string the builder wrote.
- **`UserOverrides`** – Type alias: `OverridesFor<User> & { password?: string; tokens?: Token[] }`. Derives pin-able fields from the generated `User` contract and adds the two fields (`password`, `tokens`) that contract intentionally excludes (they never appear in API responses).
- **`UserFixture`** – Type alias: `Partial<UserDocument> & { _id: … }`. The shape `makeUser` returns; ready to pass to `userRepository.create`.
- **`makeUser(fields?: UserOverrides)`** – Builds a fixture by spreading `identityOf({ id, createdAt, updatedAt })`, setting fixed `username`/`email`/`password`, then merging caller overrides via `compact({ …fields, deletedAt: toDate(deletedAt) })`. Anything absent is left for the schema to fill.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** – Imports `identityOf`, `compact`, `toDate`, and the `OverridesFor` helper type; the generic plumbing this module composes.
- **`src/modules/users/model.ts`** – Imports `Token` and `UserDocument` types. The model's pre-save hook is responsible for hashing the plaintext password this module writes.
- **`src/modules/users/demo.ts`** – Consumes `makeUser` / `PLAIN_PASSWORD` to seed demo accounts.
- **`src/modules/users/tests/fixtures.ts`** – Test-layer re-export or wrapper around this module.
- **`src/modules/users/tests/unit/fixtures.test.ts`** – Unit-tests the `makeUser` builder itself.
- **`src/modules/users/tests/integration/repository.test.ts`** – Feeds fixtures into the user repository for integration tests.
- **`src/types/index.ts`** – Source of the `User` type that `UserOverrides` is derived from.

## Notes

- **Password stays plaintext here on purpose.** `userSchema`'s pre-save hook performs the hash on the way into Mongo. Writing a pre-hashed value in a fixture would drift from that hook and break any code path that expects the hook to do the work.
- **Do not add schema-managed defaults to `makeUser`.** Fields like `admin`, `active`, `verified`, `locale`, and `imageUrl` are intentionally absent so that fixture output reflects real schema behavior.
- `compact` strips `undefined` values before spreading, so a caller can pass `{ password: undefined }` without clobbering the `PLAIN_PASSWORD` default.
