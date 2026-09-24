---
source: tests/unit/scripts/contracts/openapi-bundle.test.ts
sha256: b4d26d98521f9449567a1841e9621f0403fdde6de7878322895b8b07ed4c3db6
generated_at: 2026-09-23T20:29:46.336503+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/openapi-bundle.test.ts

## Purpose

Unit tests for the `withAppLevelResponses` post-bundle merge step in the OpenAPI contract pipeline. They verify that app-level error responses (429, and 400/413 for body-carrying operations) are injected into every operation that no individual module fragment declares, using a minimal hand-built YAML document rather than the real `openapi.yaml` to isolate the merge rule itself.

## Key elements

- **`bundle(extra)`** – Helper that serializes a minimal OpenAPI 3.0.3 document (with `x-app-level-responses` at the root and the supplied `paths`) into a YAML string, mirroring the shape `compile()` produces.
- **`parsedResult(yaml)`** – Runs `withAppLevelResponses(yaml)`, parses the resulting YAML back, and casts it to a narrow type sufficient for the assertions in this file.
- **`describe('withAppLevelResponses')`** – Six test cases covering: merging `appliesTo: 'all'` into a body-less operation; merging `appliesTo: 'requestBody'` only when a `requestBody` is present; never overwriting an operation's own response for the same code; leaving non-operation path-item fields (`parameters`) untouched; deleting the `x-app-level-responses` instruction key from the output; and throwing when that key is absent.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** – The SUT. This test imports and exercises `withAppLevelResponses` directly. The test file's doc comment references `compile()` (also in that file) to explain why the fixtures are shaped the way they are.
- **`yaml`** (package) – Used via `stringify` and `parse` to round-trip documents through the function under test.

## Notes

- Tests deliberately avoid the real `openapi.yaml`: the property under test is the merge rule (`appliesTo`, non-overwrite), not any specific operation's current responses.
- The `bundle` helper always includes both a 429 (`appliesTo: 'all'`) and a 400 (`appliesTo: 'requestBody'`) entry so the two applicability branches can be exercised in the same fixture.
- The "non-operation field" test guards against a regression where the merge would mistakenly attach responses to path-item-level keys like `parameters` or `summary`.
