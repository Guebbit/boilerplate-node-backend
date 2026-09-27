---
source: tests/unit/scripts/eslint/self-barrel-import.test.ts
sha256: c392e5f808f544257009e46964d06bb42f92ee69ac8fe5b1b9f194c2186084f3
generated_at: 2026-09-27T16:13:28.191670+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/self-barrel-import.test.ts

## Purpose

Liveness probe for the `boundaries/dependencies` ESLint policy ("a module does not import its own barrel"). It exists because the `checkInternals` flag, when left unset, causes same-module edges to skip evaluation silently — a dead policy and a passing lint look identical from the CLI. This test spawns the real `eslint` binary against a temporary probe file and asserts the rule actually fires, rather than trusting a clean `npm run lint` to mean the policy ran.

## Key elements

- **`ESLINT_BIN`** — absolute path to `node_modules/.bin/eslint`, resolved via `REPO_ROOT`.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — location (`src/modules/products/__self-barrel-probe.ts`) and repo-relative form of a temporary file that imports from its own barrel (`@modules/products`).
- **`lintProbe()`** — runs the eslint CLI with `--format json` on the probe file, parses stdout into a `message[]` list. Treats a non-zero exit (i.e. a finding) as success; only a JSON parse failure is an error.
- **`describe('a module cannot import its own barrel')`** — single test that writes the probe file, calls `lintProbe()`, and asserts at least one message carries `ruleId === 'boundaries/dependencies'`.
- **`afterEach`** — removes the probe file (`rmSync`, `force: true`) so it does not leak into the working tree.

## Relationships

- **`tests/support/paths.ts`** — imports `REPO_ROOT` to anchor both the eslint binary path and the probe file location to the repository root, independent of the CWD jest runs from.

## Notes

- The test deliberately spawns the `eslint` binary (a subprocess) instead of using `ESLint#lintFiles` via the Node API. The flat-config loader requires `jiti` to parse `eslint.config.ts`, which fails to resolve inside a jest worker's module system.
- The probe file is a **real** file on disk under `src/modules/products/`, not a virtual path, because `parserOptions.project` must resolve against a physical TypeScript program before the boundaries rule can even evaluate.
- The probe imports `productService` from `@modules/products` (its own barrel) — the exact pattern the rule is designed to reject.
- Non-zero eslint exit is the *expected* outcome (a finding was produced); the promise only rejects on malformed JSON from `--format json`.
