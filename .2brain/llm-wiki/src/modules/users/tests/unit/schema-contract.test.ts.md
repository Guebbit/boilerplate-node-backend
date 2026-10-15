---
source: src/modules/users/tests/unit/schema-contract.test.ts
sha256: 5b6ec16bb26ee1be1cd28f9762feb5ae72cf2e4b13992c05f773b4970ae1abee
generated_at: 2026-10-15T12:16:51.220586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for the user Mongoose schema, focusing on its security-sensitive guarantees: password secrecy (dual-layer `select: false` + transform `omit`), email validation anchoring, OAuth-identity shape, index uniqueness as authentication invariants, and the pre-save hook that hashes only *modified* passwords. Exists so regressions in any of these layers fail loudly at the unit level, without a database.

## Key elements

- **`describe('userSchema — what a user must carry')`** — asserts required paths (`email`, `username`), email regex (loose but anchored), defaults (`active: true`, `verifiedAt: null`, `locale` from env, `imageUrl` undefined, `deletedAt` undefined/Date-typed), and `timestamps`.
- **`describe('userSchema — the credentials never load by accident')`** — verifies `password.select === false`, that `applyUserTransform` strips `password`/`oauthAccounts` and renames `_id → id`, and that a JSON round-trip of the serialized object contains no secret substring.
- **`describe('userSchema — a linked OAuth identity')`** — checks `oauthAccounts` sub-schema required paths, its `select: false`, and default `[]`.
- **`describe('userSchema — indexes')`** — pins the exact index specs and unique/partial-filter options for `users_email`, `users_oauth_identity`, `users_pending_email`.
- **`preSaveHook()`** (local helper) — extracts the application's pre-save hook from Mongoose's internal `schema.s.hooks._pres` map by filtering on `fn.toString().includes("isModified('password')")`, avoiding a real `save()` and Mongoose's own internal hooks.
- **`describe('userSchema — the pre-save password hook')`** — calls the extracted hook with stubbed documents: verifies argon2id hashing when `isModified('password')` is true, and that an already-hashed password is left untouched when `false`.
- **Locale override test** (`it.each` with `jest.isolateModulesAsync`)** — sets `NODE_DEFAULT_LOCALE`, reloads the model module, and confirms the schema default follows the env var.

## Relationships

- **`@modules/users/model`** — primary subject; `userSchema` and `applyUserTransform` are imported and introspected throughout.
- **`@infrastructure/security/password-hash`** — `hashPassword` / `verifyPassword` validate the hook's output is a real argon2id hash.
- **`@modules/users/factories`** — supplies `PLAIN_PASSWORD` used as the known-plain input for hook tests.
- **`@tests/schema`** — provides the schema-introspection utilities (`requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, `subSchema`, `typeOf`, `indexSpecs`, `indexOptionSpecs`) that turn Mongoose schema objects into plain assertions.
- **`@tests/stub`** — `asStub` casts `userSchema` to reach Mongoose's non-public `s.hooks._pres` map.
- **`@tests/environment`** — `setEnvironment` mutates process env before the module-reload locale test.
- **`@infrastructure/config/store`** — `currentEnvironment()` read inside the locale default assertion to confirm the configured value.

## Notes

- The pre-save hook is reached through Mongoose's **internal** storage (`s.hooks._pres`), not by calling `schema.save()`. Mongoose registers its own pre-save hooks *before* the application's, so the test filters by source text (`isModified('password')`) rather than index `[0]`. If Mongoose moves this storage, the failure is a loud `undefined` / wrong-count error, not a silently skipped assertion.
- The locale test must use `jest.isolateModulesAsync` to force a fresh `import('@modules/users/model')` because schema defaults are captured at module-load time; the default-check and the override-check are in separate tests because the plain check passes even with a broken `??` expression when env equals the fallback.
- The JSON round-trip secrecy test searches for the **hash value** (`$2a$12$hash`) rather than the key name, so it still catches a leak if a future field is added beside `password`.
- Email regex tests explicitly verify `^…$` anchoring; unanchored patterns would accept strings like `"Ada" <ada@example.com> evil@attacker.test`, enabling header-injection-style abuse in recovery emails.
