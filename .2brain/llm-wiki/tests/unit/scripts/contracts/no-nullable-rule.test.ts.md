---
source: tests/unit/scripts/contracts/no-nullable-rule.test.ts
sha256: 2ec00282503e66b7965baeb4c54d85df15d2af36b3aff732ed0e45f7fdf6cedf
generated_at: 2026-11-08T10:33:24.397747+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/no-nullable-rule.test.ts

## Purpose

Integration-style test for the `no-nullable-keyword` Spectral rule. Because OpenAPI 3.1 silently ignores a stray `nullable: true` (the 3.1 way is `type: [string, 'null']`), this rule is the only mechanism that turns that mistake into a lint failure. The tests confirm the rule fires on both `nullable: true` and `nullable: false`, while accepting valid 3.1 nullability spellings.

## Key elements

- **`run`** — promisified `execFile`; used to spawn the Spectral CLI without blocking the event loop.
- **`scratch`** — mutable array of temp directories created during the test run; cleaned up in `afterEach`.
- **`RULESET`** — resolved path to `shared/contracts/spectral.modules.yaml`, the ruleset that extends the project bundle with the `no-nullable-keyword` rule.
- **`SPECTRAL`** — resolved path to the local `node_modules/.bin/spectral` binary (same binary `npm run lint:openapi:modules` invokes).
- **`nullableFindings(properties: string)`** — writes a minimal OpenAPI 3.1 document containing the supplied `properties` YAML into a temp file, runs `spectral lint --format json` against it, and returns the dot-separated JSON paths flagged by the `no-nullable-keyword` code. Non-zero exits (expected when the rule fires) are caught and their `stdout` is still parsed.
- **`describe('no-nullable-keyword')`** — two test cases:
  - *refuses `nullable: true` and `nullable: false` alike* — asserts both properties are flagged.
  - *accepts the 3.1 spellings, and a property that happens to be named nullable* — asserts no findings for `type: [string, 'null']`, `oneOf` with a null type, or a property literally called `nullable`.

## Relationships

No graph neighbors recorded.

## Notes

- The test shells out to the **real Spectral CLI binary** (not a mock or in-process import), so it requires `node_modules` to be installed and the binary to be executable.
- Spectral exits non-zero when *any* error-severity finding is present (including unrelated rules in the shared ruleset). The code deliberately catches that rejection and reads `stdout` from the error object rather than treating the non-zero exit as a test failure.
- The scratch document is intentionally minimal (`paths: {}`, one schema) but is still linted against the full `spectral.modules.yaml` ruleset; only `no-nullable-keyword` findings are extracted, so other rules firing on the stub document are harmless.
- Cleanup is per-test (`afterEach`), splicing all entries out of `scratch` and recursively removing them in parallel.
