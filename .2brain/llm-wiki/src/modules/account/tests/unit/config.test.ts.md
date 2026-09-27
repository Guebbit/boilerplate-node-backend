---
source: src/modules/account/tests/unit/config.test.ts
sha256: 012c3759f726ec7ad282df4e94a8bf9372b7fea69b0b46096ff7b764b49fcc04
generated_at: 2026-09-27T14:36:19.782090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/config.test.ts

## Purpose

Unit tests for the `accountFrontendLink` helper (defined in the account config module), verifying that each account-flow kind (`verify`, `reset`, `delete`, `email-change`) produces the correct default frontend URL and that per-kind environment-variable overrides work in isolation.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** — strips the five `NODE_FRONTEND_*` env vars before tests run, ensuring defaults are exercised.
- **`TOKEN`** — a fixed sentinel string substituted into URL query params for assertions.
- **`describe('… default template per kind')`** — five cases: one per kind asserting the full expected URL, plus a distinctness check that all four paths are unique (so a token can't be replayed into the wrong flow).
- **`describe('… per-kind override')`** — sets `NODE_FRONTEND_LINK_RESET` directly on `process.env`, asserts the `reset` URL changes while the `verify` URL stays at its default.

## Relationships

- **`src/modules/account/config.ts`** — provides `accountFrontendLink`, the function under test. This file is the sole consumer being tested here.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, a test-scope env-var cleanup utility used to guarantee a clean starting state.

## Notes

- The override test mutates `process.env` inline rather than going through the `withoutEnvironmentInThisFile` helper; Jest's module-level isolation is expected to contain the side-effect, but there is no explicit cleanup in the file.
- The file's doc-block documents a deliberate "D14" architectural decision: env-var defaults and per-kind templates live in the account config module, *not* in `infrastructure/http/frontend-link.ts` (which only performs template → URL substitution). Changing where those defaults are defined would require updating both files.
