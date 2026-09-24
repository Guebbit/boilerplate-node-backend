---
source: src/modules/antibot/tests/unit/module.test.ts
sha256: e91061b7c03d778b93e48e1f1c66ecf8a164408faba03dbe82c3bae91963f5b5
generated_at: 2026-09-23T18:23:18.784263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/unit/module.test.ts

## Purpose

Unit tests for the antibot module's boot-time configuration gate (`customCheck`). Verifies that the module's manifest correctly declares which environment variables are required based on the selected provider and email-policy settings, and that misconfiguration fails fast at boot rather than at the first guarded request.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** — imported from the test-support environment helper; clears the listed `NODE_*` variables before each test case so tests start from a clean state.
- **`configure()`** — sets `process.env.NODE_ENV = 'development'`. Required because the gate short-circuits entirely when `NODE_ENV` is `test`.
- **`assertAntibot()`** — thin wrapper that calls `assertRequiredConfig([antibotModule])`, scoping the check to this module only.
- **`describe('the antibot provider group')`** — five cases covering: default (no provider → no requirement), altcha missing its secret, turnstile missing one half of the key pair, fully-configured provider, and an unrecognized provider name.
- **`describe('the antibot email-policy group')`** — four cases covering: default (no policy → no requirement), recognized policies (`disposable`, `mx` via `it.each`), and an unrecognized policy.

## Relationships

- **`src/kernel/required-config.ts`** — supplies `assertRequiredConfig`, the assertion function this file exercises.
- **`src/modules/antibot/module.ts`** — the module under test; its manifest (including the `customCheck` and the provider/policy selectors) is what `assertRequiredConfig` reads.
- **`tests/support/environment.ts`** — supplies `withoutEnvironmentInThisFile`, the helper that resets relevant env vars per test.

## Notes

- The gate **short-circuits under `NODE_ENV=test`**. Every case must set `NODE_ENV` to something else (this file uses `development`) or the assertions will trivially pass.
- The file's top-level comment documents a design constraint: the boot gate lives on the module's own manifest so that `src/kernel/required-config.ts` (and `src/app/required-config.ts`) never name a specific module's provider.
- Negative cases use `delete process.env.X` to simulate a missing variable rather than setting it to an empty string.
