# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the user schema's contract: which paths are required, what defaults a new document gets, the email pattern's anchoring, the token sub-schema shape, declared indexes, and—most critically—that `password` and `tokens` are both `select: false` at the schema level and `omit`-ed by `applyUserTransform` at serialization. It also exercises the `pre('save')` bcrypt hook in isolation. The file exists because a silent change to any of these declarations (removing a `select` flag, dropping an anchor from the email regex, flipping an `admin` default) would be a security regression with no compile-time or runtime error.

## Key elements

- **`describe('userSchema — what a user must carry')`** — asserts required paths, email regex (anchored, rejects header-injection strings), defaults (`admin: false`, `active: true`, `verified: false`, `locale`, `imageUrl`, `tokens: []`), `deletedAt` type, and `timestamps`. Uses `jest.isolateModulesAsync` to verify the `??` fallback prefers the env-var over the hard-coded constant.
- **`describe('userSchema — the credentials never load by accident')`** — asserts `select: false` on both `password` and `tokens`, calls `applyUserTransform` directly to confirm `omit` strips both, and performs a JSON round-trip check that the raw hash/token value never appears in rendered output.
- **`describe('userSchema — a stored token')`** — asserts the token sub-schema requires `token` and `type`, leaves `expiration`/`lastUsedAt` optional, and that both are typed `Date` (not `Mixed`).
- **`describe('userSchema — indexes')`** — asserts exactly two indexes (`users_email`, `users_tokens_token`) and that only the email index carries `unique: true`.
- **`preSaveHook()` (local helper)** — reaches into Mongoose's internal Kareem store (`schema.s.hooks._pres`) to extract the registered `pre('save')` hook by matching its source for `isModified('password')`, then invokes it on a plain object to verify bcrypt is called only when `password` is modified.

## Relationships

- **`src/modules/users/model.ts`** — the system under test. Imports `userSchema` and `applyUserTransform`; all assertions target their compiled output.
- **`src/modules/users/index.ts`** — provides the `TokenType` enum used in the transform and token-sub-schema tests.
- **`tests/support/schema.ts`** — supplies the introspection utilities (`defaultOf`, `pathOptions`, `requiredPaths`, `subSchema`, `typeOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that read Mongoose schema internals without a database.
- **`tests/support/stub.ts`** — provides `asStub`, used to cast `userSchema` into a typed shape for accessing the private `s.hooks._pres` map.

## Notes

- The `preSaveHook` helper depends on Mongoose's internal Kareem layout (`s.hooks._pres`). If Mongoose renames or restructures this, the test fails loudly with `undefined`—it will not silently skip.
- The hook is selected by source-text matching (`isModified('password')`) rather than array index, because Mongoose registers its own internal `pre('save')` hooks first and `[0]` would hit one that throws on a plain object.
- The env-var fallback test (`it.each` with `NODE_DEFAULT_LOCALE` / `NODE_DEFAULT_IMAGE_USER`) relies on `jest.isolateModulesAsync` to re-import the model with a different `process.env`. The current `.env` sets those variables to the same string as the hard-coded fallback, so a simple equality assertion cannot distinguish "read from env" from "fell through `??`"—the isolated re-import is the only way to tell them apart.
- All tests are pure (no database). The bcrypt path in `preSaveHook` is the only side effect, and it is verified via spy/mocking rather than a real DB write.
