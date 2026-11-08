---
source: tests/unit/scripts/contracts/us-english-names-rule.test.ts
sha256: 10f74f76ded89d7be0fd14e94a878dd9516c9f97248fc5734532b40a92c3f185
generated_at: 2026-11-08T10:35:30.219734+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/us-english-names-rule.test.ts

## Purpose

Integration-style tests that verify the `names-in-us-english-*` Spectral rules correctly reject British spellings in machine-read identifiers (operation IDs, schema names, properties, enum values, error-code keys, channels, messages) while leaving free-form prose untouched. Covers both OpenAPI and AsyncAPI rulesets.

## Key elements

- **`run`** — promisified `execFile`; wraps the Spectral CLI so the event loop isn't blocked.
- **`scratch`** / **`afterEach`** — tracks temp directories created per test case and removes them after each `it`.
- **`SPECTRAL`** — resolved path to the repo's local `node_modules/.bin/spectral` binary (the same one `lint:*` scripts use).
- **`spellingFindings(ruleset, document)`** — writes a YAML document to a temp file, invokes Spectral with the given ruleset, parses the JSON findings from stdout, and returns an array of `"code path"` strings filtered to `names-in-us-english-*` codes.
- **`openapi(names)`** — template helper that produces a minimal OpenAPI 3.1 YAML fragment with the supplied machine-read names injected at the relevant positions.
- **`describe('names-in-us-english (OpenAPI)')`** — two cases: one asserting all five British-spelled names are flagged, one asserting US spellings (and a benign `-is`-suffixed stem) produce zero findings.
- **`describe('names-in-us-english (AsyncAPI)')`** — two cases against `spectral.asyncapi.names.yaml`: one asserting channel/message/schema flags, one asserting clean output for US spellings.

## Relationships

- Invokes the local **Spectral CLI** (`node_modules/.bin/spectral`) as a child process.
- Reads ruleset files from `shared/contracts/`: `spectral.modules.yaml` (OpenAPI) and `spectral.asyncapi.names.yaml` (AsyncAPI).
- No other files in the dependency graph.

## Notes

- Spectral exits non-zero on error-severity findings; the test catches the rejection and still reads `stdout`, because the scratch document is designed to produce only the findings under test.
- When Spectral has zero findings it prints `[]` followed by a plain-text summary line; the helper guards for that case before calling `JSON.parse`.
- Temp directories are created under `os.tmpdir()` with a `us-names-rule-` prefix and are cleaned up in `afterEach` via `scratch.splice(0)` — new dirs added during a test are cleaned at the *next* `afterEach`, not the current one (acceptable because `splice` removes them from tracking).
- The OpenAPI "accepts" test uses `promisedAt` as the property name to confirm that stems ending in letters resembling `-is`/`-ise` are not false-positives.
