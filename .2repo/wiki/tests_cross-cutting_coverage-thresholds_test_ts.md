# tests/cross-cutting/coverage-thresholds.test.ts

## Purpose

Guards against a silent failure mode in `jest.config.js`: a `coverageThreshold` key that matches zero files is ignored by Jest (run stays green, gate is dead). This test re-expands every threshold key with the same `glob` instance the CoverageReporter uses and fails the suite if any key resolves to nothing measurable. It exists because three keys detached simultaneously during a directory restructure and 203 of 275 source files sat under no floor before anyone noticed.

## Key elements

- **`jestConfig`** — `require('../../jest.config.js')`, read-only access to the `coverageThreshold` map under test.
- **`globSync`** — the `sync` function from the `glob` package resolved *through* `@jest/reporters`'s dependency tree, guaranteeing identical pattern-expansion semantics to the reporter.
- **`describe('the coverage threshold keys')`** — iterates `Object.keys(jestConfig.coverageThreshold)` excluding the `"global"` key.
- **`it('exist in more than name…')`** — asserts ≥ 10 keys so the `it.each` blocks below are not vacuous.
- **`it.each(keys)` — "still matches at least one file"** — calls `globSync(path.resolve(ROOT, key), { windowsPathsNoEscape: true })` and expects a non-empty array.
- **`it.each(keys)` — "matches at least one file the coverage run measures"** — same expansion, then filters out `.d.ts`, `tests/`, and `src/types/` files; expects at least one remaining match.

## Relationships

No graph-registered neighbors. The file's sole meaningful input is `jest.config.js` (read at the top of the file); everything it checks flows from that one `coverageThreshold` object.

## Notes

- The `require` calls are deliberate (`eslint-disable` comments explain): `jest.config.js` is CommonJS by design, and the `glob` resolution walks `@jest/reporters`'s `node_modules` to pin the exact v7 transitive instance the reporter loads. Swapping to a different `glob` major version would change extglob handling and could produce false passes.
- The test explicitly does **not** assert the converse (that every covered file is matched by some key). Deliberate absences exist (controllers, per-module `routes.ts`/`seeds.ts`), and encoding them here would legislate a ratchet decision that belongs to its owner.
- `windowsPathsNoEscape: true` is passed to mirror the reporter's call; it is a no-op on this repo's paths but preserves semantic parity.
