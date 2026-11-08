---
source: scripts/testing/suites.ts
sha256: 14df00f3bc38c8a8986e282e8c5daf1b13c7f75ea3368d387e582a6358b7835e
generated_at: 2026-11-08T03:03:57.660764+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/suites.ts

## Purpose

Single source of truth for the test-layer table: which jest path patterns each `npm run test:*` layer owns, whether its files must run serialized (shared in-memory mongod), and the peak worker memory for parallel layers. It exists as a standalone module so that both the layer runner and the staged-tests step can read one list without importing `run-suite.ts`, which executes on import.

## Key elements

- **`Suite`** (type) — Discriminated union. `serialized: true` means one file at a time per shard; `serialized: false` additionally carries `workerPeakMb` (measured peak MB per parallel worker).
- **`SUITES`** (`Record<string, Suite>`) — The layer registry keyed by the name the npm script passes (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`). Exported so `package.json` scripts that need several layers unsharded can reference names instead of re-listing patterns.
- **`LIGHT_SUITES`** (module-private) — `['unit', 'cross-cutting']`; the layers `complete:light` runs in full on every commit.
- **`isOutsideLightGate(path: string): boolean`** — Returns `true` when `path` is a `.test.ts` file under any `tests/` folder that is **not** covered by a light-gate layer. Used by the pre-commit hook to decide whether to run a changed file in isolation.

## Relationships

- **`scripts/testing/run-staged-tests.ts`** — Imports `SUITES` (and likely `isOutsideLightGate`) to build its staged-test plan.
- **`scripts/testing/run-suite.ts`** — Imports `SUITES` to know patterns and serialization mode for the layer it is about to execute. Cannot be the source of truth itself because it runs on import.
- **`tests/unit/scripts/testing/suites.test.ts`** — Unit-tests the definitions in this file (patterns, serialization flags, `isOutsideLightGate` behavior).

## Notes

- `serialized` is a **layer** property, not a machine property: integration/contract/fuzz share one in-memory mongod, so files cannot parallelise regardless of available RAM.
- `workerPeakMb` is intentionally absent from the `serialized: true` variant (discriminated union enforces this at compile time).
- The patterns stored in `SUITES` are in the **same form each npm script passes them** (e.g. `tests/unit`), not raw jest glob syntax.
- `LIGHT_SUITES` is deliberately not exported; the public interface for the light gate is `isOutsideLightGate` only.
