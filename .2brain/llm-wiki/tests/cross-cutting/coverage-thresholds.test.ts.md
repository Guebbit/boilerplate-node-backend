---
source: tests/cross-cutting/coverage-thresholds.test.ts
sha256: a1ddcdb26fad0263a91f20e949c74513f9ec48b380140c8e2daa565adb588694
generated_at: 2026-09-23T19:55:37.014524+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/coverage-thresholds.test.ts

## Purpose

Guards against the silent failure mode where a `coverageThreshold` glob key in `jest.config.js` matches zero files after a directory rename. Jest's CoverageReporter silently skips such keys, leaving a run green while the intended coverage gate no longer applies. This test expands each key with the same `glob` instance the reporter uses and fails the suite if any key resolves to nothing (or only to files excluded from measurement).

## Key elements

- **`jestConfig`** — `require('../../jest.config.js')` cast to expose `coverageThreshold`. Loaded via `require` (not ESM import) because the config is CommonJS and an ESM import would transpile/copy the very list under test.
- **`globSync`** — Resolved _through_ `@jest/reporters` (`require.resolve('glob', { paths: [require.resolve('@jest/reporters')] })`) so it is the exact `glob` instance the reporter loads, guaranteeing identical matching semantics.
- **`ROOT`** — `path.join(__dirname, '../..')`, the repo root used to resolve each glob key to an absolute path.
- **`describe('the coverage threshold keys')`** — Filters out the `global` key, then runs three assertions per remaining key:
    - _Vacuity guard_: at least 10 keys must exist.
    - _Existence_: `globSync` on the resolved key returns ≥ 1 file.
    - _Measurability_: at least one matched file is not a `.d.ts`, not under `tests/`, and not under `src/types/` (i.e., it would actually appear in a coverage report).

## Relationships

No graph neighbors are recorded for this file. It reads `jest.config.js` and `@jest/reporters` (and their transitive `glob`) at runtime but imports no project source modules.

## Notes

- **Intentional one-directionality.** The test asserts _every key matches something_, not the converse (every measured file is covered by some key). The omission is deliberate: controllers and per-module `routes.ts` files are excluded by design and would need a separate, owner-approved ratchet.
- **`windowsPathsNoEscape: true`** is passed to `globSync` to mirror the reporter's call. On this repo's paths it changes nothing, but keeping the option identical prevents a future reporter change from causing a false negative here.
- **Historical context (2026-08-19):** Three keys detached simultaneously (a single-star infra key, a per-module service-file key, and a broader gap leaving 203/275 source files uncovered). The test was the remediation.
- **Why `require` with eslint-disable:** Both `require` calls carry inline `eslint-disable-next-line @typescript-eslint/no-require-imports` comments. The rationale is fidelity to the CommonJS runtime path Jest itself uses; an ESM `import` would alter resolution.
