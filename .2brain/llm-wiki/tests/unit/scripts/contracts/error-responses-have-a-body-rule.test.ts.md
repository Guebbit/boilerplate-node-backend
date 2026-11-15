---
source: tests/unit/scripts/contracts/error-responses-have-a-body-rule.test.ts
sha256: 2a4ede1aa3617d209c07cf6093654fe40c4f58e953766125daa3b838549fe706
generated_at: 2026-11-15T00:25:44.223478+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/error-responses-have-a-body-rule.test.ts

## Purpose

Verifies the `error-responses-have-a-body` Spectral rule, which catches error responses that declare no `content` at all — a gap the separate problem-JSON rule misses because it only selects existing `.content` nodes. The test drives the real Spectral CLI against generated scratch OpenAPI documents and asserts which response paths get flagged.

## Key elements

- **`bodylessFindings(responses: string)`** — writes a minimal OpenAPI 3.1 spec into a temp directory, runs the local `spectral` binary with the project ruleset, and returns the JSON-pointer paths of findings whose `code` is `error-responses-have-a-body`.
- **`RULESET`** — resolves to `shared/contracts/spectral.yaml` (the bundle's ruleset where the rule is defined).
- **`SPECTRAL`** — resolves to the local `node_modules/.bin/spectral` binary, the same one `npm run lint:openapi` invokes.
- **`run`** — promisified `execFile`; used instead of a sync call because the CLI takes ~1 s to start.
- **`scratch` / `afterEach`** — tracks temp folders created during the run and removes them recursively after each test case.
- **Test: "flags an inline error with no content, and a $ref to a contentless component"** — asserts that both a bare inline `500` and a `$ref` to a content-less component response are reported.
- **Test: "accepts a deliberately empty error marked x-not-problem, and an error with a body"** — asserts that `x-not-problem: true` suppresses the finding, that a response with `content` passes, and that a `200` is never flagged.

## Relationships

No source-file graph neighbors are tracked. At runtime the test depends on two external artifacts resolved by relative path:

- `shared/contracts/spectral.yaml` — the ruleset containing the rule under test; the test passes it to `spectral lint --ruleset`.
- `node_modules/.bin/spectral` — the CLI binary the test execs; it must be installed (`npm install`) before the test can run.

## Notes

- Spectral lints the **resolved** document, so a `$ref`-d response is reported at its component path (`components.responses.Bare`), not at the referencing operation.
- The Spectral CLI exits non-zero on any error-severity finding; the test catches that rejection and still reads `stdout`, because other unrelated rules may also fire on the scratch document.
- The scratch spec is always a single `paths./x.get` operation; the `responses` parameter is the YAML body indented by 8 spaces and is pasted directly into the template.
- The `x-not-problem` extension is the opt-out mechanism the rule checks before flagging a body-less response.
