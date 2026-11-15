---
source: scripts/testing/suites.ts
sha256: c2e36be7b224a129b861a2fabb312b67734805bebc6809a1f8f308b9d62d58e2
generated_at: 2026-11-14T17:43:39.057923+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/suites.ts

## Purpose

Single source of truth for the project's test layers: which jest path patterns belong to each layer and whether that layer must run files serially. Extracted into its own file so both the layer runner and the staged-tests step read the same table, because `run-suite.ts` executes on import and therefore cannot be imported for its data.

## Key elements

- **`Suite`** (type, exported) — discriminated union on `serialized`. Serialized variants carry only `patterns`; parallel variants additionally carry `workerPeakMb` (measured peak MB per jest worker).
- **`SUITES`** (const, exported) — `Record<string, Suite>` keyed by the name each `npm run test:*` script passes. Defines five layers: `unit`, `cross-cutting` (parallel, 905 MB peak), and `integration`, `contract`, `fuzz` (all serialized).
- **`LIGHT_SUITES`** (const, module-private) — the subset (`unit`, `cross-cutting`) that `complete:light` runs in full on every commit.
- **`isOutsideLightGate(path)`** (function, exported) — returns `true` for a `.test.ts` file under a `tests/` directory that is *not* matched by any light-suite pattern. The pre-commit hook uses it to decide whether to run that file standalone.

## Relationships

- **`scripts/testing/run-suite.ts`** — reads `SUITES` to configure jest (path patterns, `--runInBand` for serialized layers, worker count for parallel layers). This module exists specifically so that file can import the table without triggering its own side effects.
- **`scripts/testing/run-staged-tests.ts`** — reads `SUITES` and `isOutsideLightGate` to determine which staged test files to execute in isolation at commit time.
- **`tests/unit/scripts/testing/suites.test.ts`** — unit tests for the shapes in `SUITES` and the logic of `isOutsideLightGate`.

## Notes

- `serialized` is a property of the *suite*, not the machine: those layers share one in-memory mongod, so they must be serial even on high-memory hosts.
- `workerPeakMb` is intentionally absent from serialized variants (enforced by the type), since a single in-band worker makes the number meaningless.
- The pattern strings use the same glob form that the `package.json` npm scripts pass to jest; `isOutsideLightGate` compiles them to `RegExp` at call time.
- `LIGHT_SUITES` is not exported; it is an implementation detail of the light-gate check.
