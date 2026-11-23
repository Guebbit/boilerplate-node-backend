---
source: scripts/testing/suites.ts
generated_at: 2026-11-22T02:20:20.216466+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/suites.ts

## Purpose
Defines the test layers that `npm run test:*` scripts refer to by name: which jest path patterns each layer owns, and whether its files may run in parallel. It lives in its own file because `run-suite.ts` executes on import, so the layer runner and the staged-tests step could not share its table otherwise.

## Key elements
- **`Suite`** (type): a discriminated union on `serialized`.
  - `serialized: true`: files run one at a time inside a shard, because these suites share one in-memory mongod.
  - `serialized: false`: also carries `workerPeakMb`, the measured peak cost of one parallel worker in MB.
  - Both variants have `patterns`, the path patterns handed to jest.
- **`SUITES`** (export): `Record<string, Suite>` keyed by layer name.
  - `unit` and `cross-cutting` are parallel, with `workerPeakMb` 905.
  - `integration`, `contract` and `fuzz` are serialized.
  - Patterns cover both top-level `tests/<layer>` and `src/modules/.*/tests/<layer>`. `cross-cutting` has only `tests/cross-cutting`.
- **`LIGHT_SUITES`** (private): `unit` and `cross-cutting`, the layers `complete:light:gates` runs in full on every commit.
- **`isOutsideLightGate(path)`** (export): returns true for a repo-relative test file (a path ending in `.test.ts`) under a `tests/` folder that matches none of the light layers' patterns. The pre-commit hook runs such a file on its own when the commit adds or changes it.

## Relationships
- `run-suite.ts` and `run-staged-tests.ts` both read this table. `run-suite.ts` is the layer runner and `run-staged-tests.ts` is the staged-tests step. The file says it was split out because `run-suite.ts` runs on import.
- `tests/unit/scripts/testing/suites.test.ts` is the unit test for this module.

## Notes
- `serialized` is a property of the layer, not the machine: these suites share one mongod regardless of free memory.
- `workerPeakMb` exists only on non-serialized suites, so the type system stops it being read on a serialized layer.
- Patterns are used both as jest path patterns and as regexes in `isOutsideLightGate` (`new RegExp(pattern)`), so they are regex strings such as `src/modules/.*/tests/unit`.
- `SUITES` is exported so that scripts needing several layers unsharded (the JSON report, randomized order) can name them instead of hand-copying jest patterns.
