---
source: tests/unit/scripts/contracts/openapi-bundle.test.ts
sha256: 2a2d6de3e3df91c55763e749ce8eb29b9b313fd89ee7b5bbe581b81617069463
generated_at: 2026-10-15T13:26:05.934169+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/openapi-bundle.test.ts

## Purpose

Unit tests for the four post-bundle transformation functions in `scripts/contracts/openapi-bundle.ts`. Each suite isolates a single merge/stamp/publish rule (app-level responses, module stamps, error-code catalogue, versioned-resource headers) and drives it with a minimal inline YAML document rather than the full `openapi.yaml`, so the assertion targets the rule itself rather than any particular route's current state.

## Key elements

- **`bundle(extra)`** – builds a small OpenAPI 3.1 YAML string with a fixed `x-app-level-responses` block (429 `appliesTo: all`, 400 `appliesTo: requestBody`) and the caller-supplied `paths`. Used by the `withAppLevelResponses` suite.
- **`parsedResult(yaml)`** – runs `withAppLevelResponses` then `parseYaml`, casting to the narrow shape the assertions read.
- **`withAppLevelResponses` suite** – verifies: 429 merged on all operations; 400 only on operations with `requestBody`; no overwriting of an operation's own response for the same code; non-operation path-item fields (e.g. `parameters`) left untouched; the `x-app-level-responses` instruction key is deleted; throws when the key is absent.
- **`stampBundle` / `stampedResult`** – helpers for the `withModuleStamps` suite.
- **`withModuleStamps` suite** – verifies: every operation under a mapped path gets `x-module`; unmapped paths stay unstamped; non-operation fields untouched; throws when the document does not parse to an object.
- **`errorCodesBundle` / `errorCodesResult`** – helpers for the `withErrorCodes` suite.
- **`withErrorCodes` suite** – verifies: catalogue is published as `x-error-codes` with keys sorted alphabetically; throws when the `ErrorItem` schema is missing; throws on non-object parse.
- **`versionedPath(marker)` / `run(paths)`** – helpers for the `withVersionedResources` suite.
- **`withVersionedResources` suite** – verifies: listed reads and PATCHes get an `ETag` header on their 200; listed writes get `If-Match` after existing parameters plus a 412 response; listed DELETEs get 412 but no ETag; unlisted operations are untouched; throws for undeclared methods, non-read/write methods, and when the 200 is a `$ref` rather than inline.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** – the sole source under test. This file imports `withAppLevelResponses`, `withModuleStamps`, `withErrorCodes`, and `withVersionedResources` from that module and exercises each in isolation. No other files are imported or depended upon.

## Notes

- Every suite deliberately uses a *minimal* inline bundle (one or two paths, one or two operations) instead of the real `openapi.yaml`. The doc comments make explicit that the property under test is the transformation rule, not any operation's current responses. When adding a test, keep bundles small and focused on the rule being asserted.
- The "non-operation path-item field" cases (e.g. `parameters`, `summary`) are guard tests ensuring the transform only touches entries in `OPERATION_METHODS` and does not accidentally attach responses or headers to path-item-level keys.
- `withErrorCodes` requires a `components.schemas.ErrorItem` entry to exist in the bundle; the throw test for its absence is intentional and documents that coupling.
- The `withVersionedResources` tests distinguish read vs. write semantics: reads get ETag on 200, writes get `If-Match` parameter + 412, and DELETE gets 412 but no ETag (it "answers no row").
