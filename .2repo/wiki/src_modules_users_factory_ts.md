# src/modules/users/factory.ts

## Purpose

Builds user fixtures for demo data (`./demo`) and test setups. It deliberately omits any field whose value is supplied by the schema (e.g. `locale`, `admin`, `active`, `verified`), so that `demo-data.json` and test records reflect what the model actually produces rather than a hand-repeated subset of the contract.

## Key elements

- **`PLAIN_PASSWORD`** (`'Password1!'`) — Default plaintext password stamped onto every fixture. Exported so login tests reference the same string instead of re-typing it. Chosen to satisfy the real `CreateUserBody` password policy.
- **`UserOverrides`** — The "pin" type a caller passes to `makeUser`. Extends the generated `OverridesFor<User>` (from `@types`) and adds two fields the API contract intentionally excludes from responses: `password` and `tokens`.
- **`UserFixture`** — `Partial<UserDocument> & { _id }`; the shape returned by `makeUser`, ready to hand to `userRepository.create`.
- **`makeUser(fields?)`** — The factory function. Spreads `identityOf` (id / timestamps), sets sensible defaults for `username`, `email`, `password`, then overlays caller-supplied `fields` via `compact` (drops `undefined` values) and converts `deletedAt` with `toDate`.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — Source of the shared helpers `identityOf`, `compact`, `toDate`, and the `OverridesFor<T>` type used throughout.
- **`src/modules/users/model.ts`** — Provides the `Token` and `UserDocument` types. The model's pre-save hook is what hashes `password`; the schema is what fills the omitted defaults.
- **`src/types/index.ts`** — Supplies the generated `User` type that `UserOverrides` extends.
- **`src/modules/users/demo.ts`** — Consumes `makeUser` to produce the accounts recorded in `demo-data.json`.
- **`src/modules/users/tests/factory.ts`** — Unit-tests `makeUser` itself.
- **`src/modules/users/tests/integration/repository.test.ts`** — Uses fixtures built here to exercise repository operations end-to-end.

## Notes

- **Never hash in the factory.** The password is plaintext by design; the model's pre-save hook performs hashing. Pre-hashing here previously caused a drift bug (`gino@pino.it` fixture) where the stored value no longer matched the hook's output.
- **Omitted fields are intentional.** If a new field appears in `openapi.yaml` / the schema, it will be absent from the fixture by default — that's correct. Only add it to `UserOverrides` if a test genuinely needs to pin it.
- **`compact` filters `undefined`.** Passing `{ password: undefined }` to `makeUser` will fall back to `PLAIN_PASSWORD`, not store an empty value.
