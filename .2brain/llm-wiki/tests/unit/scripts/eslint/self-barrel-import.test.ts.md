---
source: tests/unit/scripts/eslint/self-barrel-import.test.ts
sha256: ed76dc9a7fe837f3ba91ce37166438cc579c5c4c69935e8981046c5fb30ad04f
generated_at: 2026-11-08T10:37:22.638972+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/self-barrel-import.test.ts

## Purpose

Liveness probe for the `boundaries/dependencies` "no self-barrel import" policy in `eslint.config.ts`. It proves the rule actually fires on a real same-module edge, rather than trusting a clean `npm run lint` to mean the policy was evaluated (an unset `checkInternals` would skip same-module edges silently with zero CLI difference).

## Key elements

- **`ESLINT_BIN`** — Resolves to `node_modules/.bin/eslint` under the repo root; the subprocess target.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — Temporary file at `src/modules/users/__self-barrel-probe.ts`; must be a real on-disk file so `parserOptions.project` can build a TypeScript program.
- **`lintProbe()`** — Spawns the eslint CLI with `--format json --no-warn-ignored <probe>` via `execFile`, parses the JSON stdout into a `{ ruleId }[]`. Treats a non-zero exit as expected (a finding *is* the pass condition); only a JSON parse failure rejects.
- **Test: "is refused by boundaries/dependencies, not silently allowed"** — Writes the probe (a self-barrel import), runs `lintProbe`, asserts a `boundaries/dependencies` message is present. Cleans up in `afterEach`.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to anchor all filesystem paths (eslint binary, probe file) to the repository root regardless of where jest resolves the test.

## Notes

- Spawns the real `eslint` binary rather than the Node `ESLint#lintFiles` API because the flat-config loader requires `jiti`, which does not resolve inside jest's worker module system (same rationale as `apply.test.ts` shelling out).
- The probe file must exist on disk under `src/modules/users/`; a virtual/in-memory path fails at `parserOptions.project` resolution before the boundaries rule runs.
- Non-zero exit code from `execFile` is the *expected* success signal here; the callback ignores `_error` and only rejects on a JSON parse failure.
- `afterEach` uses `rmSync(..., { force: true })` so a failed test does not leave the probe file behind.
