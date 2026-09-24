---
source: tests/unit/scenarios/accounts.test.ts
sha256: 11af1b529a0b6cc5a6f52b2bdd447bc332c79f4897293444abb8bb92ed6a5917
generated_at: 2026-09-23T20:28:55.558829+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/accounts.test.ts

## Purpose

Unit tests for the seed/demo account identities defined in `scenarios/accounts.ts`. Verifies that the two hardcoded fallback passwords satisfy the same Zod policy every password-setting endpoint enforces, that `NODE_SEED_*_PASSWORD` env vars correctly override (or leave alone) each account's password, and that the `seedCredentials` export and `hasFallbackSeedPassword()` helper report the right values under each configuration.

## Key elements

- **`satisfiesPolicy(password)`** — one-liner that runs `zodUserSchema.pick({ password: true }).safeParse` and returns a boolean; the single source of truth for "is this password acceptable?" in every test here.
- **`reloadWith(admin, user)`** — sets or deletes the two admin/user env vars, calls `jest.resetModules()`, then dynamically re-imports `@scenarios/accounts` so the module-scope `process.env` reads re-execute.
- **`reloadAllWith(overrides)`** — same pattern but covers all four password env vars (admin, user, editor, moderator); used by the `hasFallbackSeedPassword` block.
- **`ORIGINAL`** — snapshot of the two env var values captured at import time; restored in `afterEach` to guarantee isolation.
- **`ALL_PASSWORD_KEYS`** — the four `NODE_SEED_*_PASSWORD` names, used to save/restore the full env state in the `hasFallbackSeedPassword` describe block.
- **Four `describe` blocks** — "the demo identities" (unique emails), "the seeded passwords" (policy, fallback, per-account override, independence), "seedCredentials" (export matches the resolved values), "hasFallbackSeedPassword" (true while any account is still at fallback, false only when all four are overridden).

## Relationships

- **`scenarios/accounts.ts`** — the module under test. The test imports its named exports (`SEED_*_EMAIL`, `SEED_*_PASSWORD`, `seedCredentials`, `hasFallbackSeedPassword`) at the top level for static assertions, and re-imports it dynamically after `jest.resetModules()` for every env-var-override case.
- **`src/modules/users/index.ts`** — provides `zodUserSchema`, which the `satisfiesPolicy` helper uses to confirm seed passwords pass the same validation as any user-facing password endpoint.
- **`src/modules/users/model.ts`** — graph neighbor of the schema; the test does not import from it directly, but the schema it validates against is defined/re-exported through the users module chain.

## Notes

- **Module-scope env reads:** `scenarios/accounts.ts` reads `process.env` at module load time, so the tests cannot simply mutate `process.env` and re-assert. Every override case must `jest.resetModules()` + `import()` again. Forgetting the `resetModules()` call would silently test the stale constant.
- **`hasFallbackSeedPassword` scope:** this function checks all four role passwords (admin, user, editor, moderator), not just the two the test file's top-level imports expose. The `reloadAllWith` helper and the four-key `ALL_PASSWORD_KEYS` array exist solely to drive that function; the editor/moderator env vars are never imported as named constants in this file.
- **Paired-frontend coupling:** the file's own comments note that a separate frontend repo maintains a hardcoded copy of these credentials for its e2e suite. A password change here has no compile-time or test-time safety net on the frontend side.
- **Cleanup discipline:** both `afterEach` hooks restore env vars *and* call `jest.resetModules()`. Omitting the reset would let a later test file (or a re-run within the same worker) pick up a mutated module cache.
