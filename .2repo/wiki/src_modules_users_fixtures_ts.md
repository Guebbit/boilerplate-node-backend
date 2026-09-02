# src/modules/users/fixtures.ts

## Purpose

Builds a minimal, schema-respecting user object for demo data and tests. It deliberately omits every field the Mongoose schema defaults (`imageUrl`, `locale`, `admin`, `active`, `verified`, `tokens`) so that `demo-data.json` reflects actual schema behavior rather than a restated copy. The password is always plaintext here; hashing is delegated to the model's pre-save hook.

## Key elements

- **`PLAIN_PASSWORD`** – The single plaintext password (`'Password1!'`) assigned to every unpinned fixture. Satisfies the real `CreateUserBody.shape.password` policy so fixtures can exercise genuine signup flows. Exported so tests that log in reference the same constant instead of a duplicated string.
- **`UserOverrides`** (type) – What a caller may pin when building a fixture. Derived from `OverridesFor<User>` (from `@types`) plus two additions the public contract omits: `password` (plaintext) and `tokens`.
- **`UserFixture`** (type) – The return shape of `makeUser`: `Partial<UserDocument> & { _id }`, i.e. a document ready for `userRepository.create`.
- **`makeUser(fields?)`** – The builder function. Accepts an optional `UserOverrides` object, spreads `identityOf` defaults (id / timestamps), sets fixed `username`, `email`, and `password`, then applies caller overrides via `stripUndefined` (so `undefined` values never shadow schema defaults). `deletedAt` and `twoFactorEnabledAt` are passed through `toDate`.

## Relationships

- **`@infrastructure/persistence/fixtures`** – Supplies the generic helpers `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` type alias used throughout.
- **`./model`** – Provides the `Token` and `UserDocument` types. Its pre-save hook is the single place that hashes `password`; this file never calls a hash function.
- **`@types`** – Source of the generated `User` type, from which `UserOverrides` is derived.
- **`./demo`** – Primary consumer; builds the demo accounts whose shapes are captured in `demo-data.json`.
- **`tests/fixtures.ts`** – Wraps or re-exports this builder for test suites.
- **`tests/integration/repository.test.ts` / `tests/unit/fixtures.test.ts`** – Consume `makeUser` and `PLAIN_PASSWORD` to create and authenticate fixture users.

## Notes

- **Password is never hashed here.** If you add a hash in this file it will drift from the model's pre-save hook. Always pass plaintext.
- **Do not add schema-defaulted fields** (`admin`, `active`, `verified`, `locale`, `imageUrl`, `tokens`) as fixed values in `makeUser`. Their absence is intentional: it lets the schema own the defaults so demo data stays truthful.
- **`stripUndefined` matters.** Passing `undefined` for an override field would otherwise overwrite the schema default with `undefined` in the document sent to MongoDB.
- **`UserOverrides` ≠ `User`.** The public `User` type omits `password` and `tokens` (they never appear in API responses). The overrides type adds them back because a fixture *must* set them before the document hits the repository.
