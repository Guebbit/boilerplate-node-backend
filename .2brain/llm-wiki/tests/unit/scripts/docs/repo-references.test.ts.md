---
source: tests/unit/scripts/docs/repo-references.test.ts
sha256: 32539bb5f60843508033f4fdf47567bba8b451569922796e443e52212c9b944b
generated_at: 2026-10-15T13:27:32.663033+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/repo-references.test.ts

## Purpose

Unit tests for `scripts/docs/repo-references.ts`. Verifies that `gitEnvironment()` correctly strips hook-inherited git variables so nested `git` calls don't read the wrong repo, and that `trackedTargets()` + `resolves()` only accept citations that point to files actually tracked by the index.

## Key elements

- **`HOOK_VARS`** — `readonly` tuple of the three env vars (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`) that git injects into a pre-commit hook's process; referenced by the "no-op" test.
- **`describe('gitEnvironment')`** — three cases: (1) all three hook vars are absent from the returned object, (2) unrelated vars (e.g. `PATH`) pass through unchanged, (3) when none of the three are set the return value equals `process.env`.
- **`describe('trackedTargets')`** — spins up a real scratch repo (`git init` + `git add`) in a `mkdtempSync` temp dir. Two cases: a tracked source file resolves to `true`; a `.2brain/llm-wiki` mirror page does **not** vouch for a source file that isn't in the index (`false`).
- **`setProcessEnvironment`** (from `@tests/environment`) — used to inject/remove env vars per test case; the harness restores them afterwards.

## Relationships

- **`scripts/docs/repo-references.ts`** — the system under test. Imports `gitEnvironment`, `resolves`, and `trackedTargets`.
- **`tests/support/environment.ts`** (aliased `@tests/environment`) — provides `setProcessEnvironment` for safe, scoped env-var mutation in tests.
- **`scripts/git-base.ts`** — listed as a graph neighbor (likely a shared git utility consumed by `repo-references.ts`), but not directly imported by this test file.

## Notes

- The `trackedTargets` tests shell out to real `git` (`init`, `add`) in a temp directory; they require a working `git` binary on `PATH`. They are not pure-logic tests.
- `gitEnvironment()` is also passed as the `env` option when invoking `git` inside `beforeEach`, meaning the SUT is used to sanitize its own test harness's subprocess calls.
- The `.2brain/llm-wiki/` path in the scratch repo models a mirror-wiki layout; the test asserts that a mirror page existing in the index does not make a missing source file resolvable.
