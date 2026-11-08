---
source: src/modules/users/tests/unit/schema-contract.test.ts
sha256: 649e12b78dc89bec5fadcdd031c8f19a5be8db5a6282d3341cef3cfe9803c8b6
generated_at: 2026-11-08T08:59:08.508943+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for the `userSchema` — the most security-sensitive schema in the codebase. Verifies that required paths, defaults, email validation, password concealment (`select: false` + transform `omit`), OAuth sub-document shape, index declarations, and the `pre('save')` hashing hook all hold the invariants the authentication and recovery flows depend on.

## Key elements

- **`describe('userSchema — what a user must carry')`** — asserts required paths (`email`, `username`), email regex anchoring and permissiveness, defaults for `active`, `verifiedAt`, `locale`, `imageUrl`, `deletedAt`, and `timestamps`.
- **`describe('userSchema — the credentials never load by accident')`** — verifies `password` has `select: false`, the transform strips `password`/`oauthAccounts`, and a JSON round-trip leaks no hash.
- **`describe('userSchema — a linked OAuth identity')`** — asserts required sub-fields, `select: false` on `oauthAccounts`, and an empty-array default.
- **`describe('userSchema — indexes')`** — pins the exact four index specs and their uniqueness/partial-filter options.
- **`preSaveHook()`** — helper that extracts the application's `pre('save')` hook from Mongoose's internal `schema.s.hooks._pres` map (filtering by the `isModified('password')` source string) so the hook can be invoked against a plain object without a database.
- **`describe('userSchema — the pre-save password hook')`** — asserts the hook hashes a modified password (verifying argon2id output via `verifyPassword`) and leaves an unmodified stored hash untouched.
- **`it.each` env-override test** — uses `setEnvironment` + `jest.isolateModulesAsync` to prove `NODE_DEFAULT_LOCALE` wins over the hardcoded fallback when the module is reloaded.

## Relationships

- **`@modules/users/model`** — under test: `userSchema` and `applyUserTransform` are the two public exports exercised throughout.
- **`@infrastructure/security/password-hash`** — `hashPassword` seeds a stored-hash fixture; `verifyPassword` confirms the hook's output is a valid argon2id hash.
- **`@modules/users/factories`** — supplies `PLAIN_PASSWORD` as the known-plaintext test constant.
- **`@tests/schema`** — provides introspection helpers (`requiredPaths`, `pathOptions`, `defaultOf`, `typeOf`, `subSchema`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that read the compiled Mongoose schema without instantiating a document.
- **`@tests/environment`** — `setEnvironment` mutates env vars in-process so the `isolateModulesAsync` reload picks up a different `NODE_DEFAULT_LOCALE`.
- **`@infrastructure/config/store`** — `currentEnvironment` is read to compute the expected locale default (env value ?? `'en'`).
- **`@tests/stub`** — `asStub` casts `userSchema` to reach the non-public `s.hooks._pres` property without TypeScript errors.

## Notes

- The pre-save hook is extracted by filtering `fn.toString()` for `isModified('password')` because Mongoose registers its own internal pre-save hooks first; grabbing index `[0]` would hit an internal hook that throws on a plain object.
- The locale-default test explicitly reloads the module under `jest.isolateModulesAsync` because defaults are captured at module-load time; without the reload, a broken `??` expression is indistinguishable from a correct one when env vars happen to equal the fallback.
- The email-anchoring test covers real injection vectors (header smuggling via `\nBcc:`, comma-separated addresses, display-name prefixes) — the schema regex is intentionally loose on valid shapes but must reject anything with extraneous content.
- The `deletedAt` type assertion (`Date`, not `Mixed`) is flagged as load-bearing: visibility scopes use `$exists` and a string/Date mismatch changes sort order.
