---
source: src/modules/users/tests/unit/schema-contract.test.ts
sha256: 649e12b78dc89bec5fadcdd031c8f19a5be8db5a6282d3341cef3cfe9803c8b6
generated_at: 2026-10-29T06:24:19.474609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for the `userSchema` Mongoose definition. Because this is the most security-sensitive schema in the codebase (password hashing, credential leakage, OAuth identity, uniqueness invariants), these tests pin down the schema's *declarative* guarantees—required paths, field defaults, `select: false` layers, index specs, and the pre-save hook's behavior—without touching a database or issuing real Mongoose saves.

## Key elements

- **`describe` blocks (5 groups):**
  - *Required / defaults / email pattern / timestamps* — asserts `requiredPaths`, `defaultOf`, `typeOf`, email `match` regex (including anchoring and edge-case addresses), and `timestamps`.
  - *Credentials never load by accident* — verifies `select: false` on `password`, that `applyUserTransform` omits `password`/`oauthAccounts` and renames `_id→id`, and that a JSON round-trip of the serialized object contains no hash substring.
  - *Linked OAuth identity* — required sub-schema paths, `select: false` on `oauthAccounts`, and default of `[]`.
  - *Indexes* — exact set of index specs and unique/partial-filter options via `indexSpecs` / `indexOptionSpecs`.
  - *Pre-save password hook* — calls the extracted hook directly against a stub document with a mocked `isModified`.

- **`preSaveHook()` (local helper):** Reaches into `userSchema.s.hooks._pres` (Mongoose internals) and selects the single pre-save entry whose source contains `isModified('password')`. Avoids grabbing Mongoose's own internal pre-save hooks. Throws a descriptive error if exactly one matching hook is not found.

- **`setEnvironment` + `jest.isolateModulesAsync` block:** Reloads `@modules/users/model` under a modified `NODE_DEFAULT_LOCALE` to prove the `??` fallback is actually consulted, not just coincidentally equal to the default.

## Relationships

- **`src/modules/users/model.ts`** — source of `userSchema` and `applyUserTransform`; the primary subject under test.
- **`src/modules/users/factories.ts`** — provides `PLAIN_PASSWORD` used by the pre-save hook tests.
- **`src/infrastructure/security/password-hash.ts`** — `hashPassword` / `verifyPassword` verify that the hook produces a valid argon2id hash.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment` supplies the live `NODE_DEFAULT_LOCALE` value for the locale-default assertion.
- **`tests/support/schema.ts`** — provides the `defaultOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `requiredPaths`, `subSchema`, `typeOf` introspection helpers.
- **`tests/support/stub.ts`** — `asStub` casts `userSchema` to access its private `.s.hooks._pres` map without a type error.
- **`tests/support/environment.ts`** — `setEnvironment` mutates process env for the isolated-module reload test.

## Notes

- The pre-save hook is exercised as a **pure function** on a plain object (`{ password, isModified }`), never through a real Mongoose `save()`. If Mongoose relocates its middleware storage (`s.hooks._pres`), the helper throws a loud error rather than silently skipping assertions.
- Mongoose registers its own internal pre-save hooks before the user's, so the helper filters by source-code content (`isModified('password')`) instead of array index `[0]`.
- The email-pattern tests read the *compiled* regex via `pathOptions(...).match`; they do not restate the pattern, keeping the test coupled to the actual schema definition.
- The locale-fallback test (`jest.isolateModulesAsync`) exists because the checkout's env vars happen to equal the hardcoded fallbacks—without the reload, a broken `??` would still pass.
