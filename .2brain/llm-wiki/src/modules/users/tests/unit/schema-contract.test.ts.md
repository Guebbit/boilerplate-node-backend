---
source: src/modules/users/tests/unit/schema-contract.test.ts
sha256: b5d48bbc59bca4bdcaad969714db9f78c1ec511d3de25f3ae4a3f1ba8b03406d
generated_at: 2026-09-23T19:36:59.307123+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the security-critical contract of `userSchema`: which fields are required, how `password`/`tokens`/`oauthAccounts` are hidden from accidental reads and serialization, what defaults a new user receives, the exact index set and uniqueness invariants, and that the `pre('save')` bcrypt hook fires only when `password` is actually modified.

## Key elements

- **`describe('userSchema — what a user must carry')`** — Asserts required paths (`email`, `username`), the anchored email regex (including anti-smuggling vectors like injected Bcc headers), defaults for `active`, `verifiedAt`, `locale`, `imageUrl`, `tokens`, `deletedAt`, and the `timestamps` option. Includes a `jest.isolateModulesAsync` block to verify that env-var overrides (`NODE_DEFAULT_LOCALE`, `NODE_DEFAULT_IMAGE_USER`) are preferred over hardcoded fallbacks.
- **`describe('userSchema — the credentials never load by accident')`** — Verifies `select: false` on `password` and `tokens`, confirms `applyUserTransform` omits both (plus `oauthAccounts`) and performs the `_id → id` rename, and checks that a `JSON.stringify` round-trip of the transformed object contains no secret substring.
- **`describe('userSchema — a stored token')`** — Checks that the `tokens` sub-schema requires `token` and `type`, leaves `expiration`/`lastUsedAt` optional but typed as `Date`.
- **`describe('userSchema — a linked OAuth identity')`** — Asserts required fields on `oauthAccounts`, `select: false`, and a default of `[]`.
- **`describe('userSchema — indexes')`** — Locks in exactly four index specs and their uniqueness/partial-filter options.
- **Truncated hook test** — Reaches into Mongoose's internal `schema.s.hooks._pres` to exercise the `pre('save')` bcrypt hash hook without a database.

## Relationships

- **`@modules/users/model`** (`src/modules/users/model.ts`) — Source of `userSchema`, `applyUserTransform`, and `TokenType`; the sole system under test.
- **`@tests/schema`** (`tests/support/schema.ts`) — Provides the assertion helpers (`defaultOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `requiredPaths`, `subSchema`, `typeOf`) used throughout.
- **`@modules/users/factories`** (`src/modules/users/factories.ts`) — Supplies the `PLAIN_PASSWORD` constant for the bcrypt hook test.
- **`@tests/stub`** (`tests/support/stub.ts`) — Exports `asStub`, imported for use in the (truncated) hook-related assertions.

## Notes

- The email-regex tests deliberately exercise the *compiled* pattern from the schema rather than re-stating a regex, so they remain valid if the pattern text changes but the compiled shape is what matters.
- The env-var override test uses `jest.isolateModulesAsync` + dynamic `import` because defaults are captured at module-load time; a simple property check cannot distinguish a working `??` from a broken one when the env var equals the fallback.
- The `deletedAt` type assertion (`Date`, not `Mixed`) is load-bearing: visibility scopes use `$exists` on it, and a `Mixed` path would accept ISO strings that sort differently.
- The JSON round-trip assertion searches for the *secret value*, not the key name, so adding a sibling field beside `password` won't mask a regression.
- The hook test intentionally avoids a real `save()` call; it pokes Mongoose's internal `_pres` array. If Mongoose relocates that storage, the test fails loudly (the file's JSDoc notes this).
