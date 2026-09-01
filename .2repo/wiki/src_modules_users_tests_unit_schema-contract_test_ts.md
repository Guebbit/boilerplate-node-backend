# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Contract test for `userSchema`, the most security-sensitive schema in the codebase. It pins down required fields, email validation anchoring, credential-hiding guarantees (`select: false` + transform `omit`), token sub-schema shape, index declarations, and the pre-save password-hashing hook—without ever opening a database connection.

## Key elements

- **`preSaveHook()`** (local helper) — Extracts the password-hashing `pre('save')` hook from Mongoose's internal `schema.s.hooks._pres` map by filtering on function source (`isModified('password')`), avoiding a real `save()` and bypassing Mongoose's own pre-save hooks that would throw on a plain object.
- **`describe('…what a user must carry')`** — Asserts required paths (`email`, `password`, `username`), email regex anchoring (rejects header-injection payloads), security-critical defaults (`admin: false`, `verified: false`, `active: true`), env-overridable defaults (`locale`, `imageUrl`) via `jest.isolateModulesAsync`, `tokens` defaulting to `[]`, `deletedAt` typed as `Date`, and `timestamps: true`.
- **`describe('…credentials never load by accident')`** — Verifies `select: false` on `password` and `tokens`, that `applyUserTransform` strips both, and that a full JSON round-trip of the serialized user contains neither the hash nor a live token value.
- **`describe('…a stored token')`** — Confirms token sub-schema requires `token` + `type`, leaves `expiration`/`lastUsedAt` optional, and types both as `Date` (not `Mixed`).
- **`describe('…indexes')`** — Pins the exact index set (`users_email`, `users_tokens_token`) and the unique constraint on email.
- **`describe('…the pre-save password hook')`** — Calls the extracted hook on a mock document: verifies it bcrypt-hashes a modified password and leaves an unmodified (already-hashed) password untouched.

## Relationships

- **`src/modules/users/model.ts`** — Imports `userSchema` and `applyUserTransform`; the direct subject under test.
- **`src/modules/users/index.ts`** — Imports `TokenType` enum (used in token-shape and serialization assertions).
- **`tests/support/schema.ts`** — Provides all schema-introspection helpers (`requiredPaths`, `pathOptions`, `defaultOf`, `typeOf`, `optionsOf`, `subSchema`, `indexSpecs`, `indexOptionSpecs`).
- **`tests/support/stub.ts`** — Provides `asStub`, a type-unsafe cast used to reach Mongoose's non-public `s.hooks` property.

## Notes

- **No database is touched.** The pre-save hook is invoked by reaching into Mongoose internals and calling `fn` on a plain-object mock; `applyUserTransform` is called directly. This keeps the test a pure-function check.
- **Hook selection is content-based, not index-based.** Mongoose registers its own pre-save hooks first; grabbing `_pres.get('save')[0]` would hit an internal hook that throws. The filter on `isModified('password')` avoids that and fails loudly (with a diagnostic message) if the hook is removed or Mongoose changes its storage.
- **Env-var defaults require module reload.** `locale` and `imageUrl` defaults are captured at import time, so the test mutates `process.env` and uses `jest.isolateModulesAsync` to re-import the module. Cleanup is in a `finally` block.
- **Email tests assert anchoring explicitly.** The pattern is expected to reject leading/trailing whitespace, display-name prefixes, and newline-separated second addresses—guarding against header-injection in recovery-email flows.
- **The JSON round-trip test searches for the secret value, not the key.** This means a future field added beside `password` would still be caught if it accidentally carries the hash or token string.
