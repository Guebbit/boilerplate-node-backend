---
source: tests/unit/scripts/eslint/self-barrel-import.test.ts
sha256: ed76dc9a7fe837f3ba91ce37166438cc579c5c4c69935e8981046c5fb30ad04f
generated_at: 2026-10-15T13:27:50.397660+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/self-barrel-import.test.ts

## Purpose

Liveness probe for the `boundaries/dependencies` ESLint rule's "a module does not import its own barrel" policy. It exists because the bug it guards against (`checkInternals` unset) causes same-module edges to be skipped silently—`npm run lint` exits clean whether or not the rule ever fired. This test proves the rule actually evaluates by forcing a violation and asserting the rule ID appears in the output.

## Key elements

- **`lintProbe()`** — Spawns the real `eslint` binary (`node_modules/.bin/eslint`) with `--format json` against the probe file. Treats a non-zero exit as expected (a finding was reported) and only rejects on failure to parse ESLint's JSON output. Returns an array of `{ ruleId }` messages.
- **`describe('a module cannot import its own barrel')`** — Single test that writes a probe file importing from its own barrel (`@modules/users`), runs `lintProbe()`, and asserts `boundaries/dependencies` is present in the messages.
- **`afterEach`** — Removes the probe file via `rmSync` so it never lingers in the tree.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — The temporary file is placed under `src/modules/users/` so `parserOptions.project` can resolve it against a real TypeScript program.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT`, which anchors both the `ESLINT_BIN` path (`node_modules/.bin/eslint`) and the probe file location.

## Notes

- Spawns a subprocess rather than using the `ESLint#lintFiles` Node API: the config loader needs `jiti` to read `eslint.config.ts`, which does not resolve inside a Jest worker's module system. A subprocess also mirrors what `npm run lint` actually does.
- The probe file must be a **real** file on disk under the module directory; a virtual path fails at `parserOptions.project` resolution before the boundaries rule executes.
- A non-zero exit code from ESLint is the **expected** outcome (a lint finding was produced). The only true error path is unparseable JSON on stdout.
- The probe file is created and destroyed within a single test; it is not a committed fixture.
