---
source: tests/unit/scripts/contracts/openapi-bundle.test.ts
sha256: f3a4393c96eb97b7c3f2618c6efcf485d6018be976559e6c38fd77f06d985c01
generated_at: 2026-11-08T10:33:39.049130+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/openapi-bundle.test.ts

## Purpose

Unit tests for the post-bundle transformation steps exported by `scripts/contracts/openapi-bundle.ts`. Each step mutates an already-assembled `OpenApiDocument` in place; these tests exercise the merge/stamp rules in isolation using minimal hand-written documents rather than the real compiled `openapi.yaml`, so the assertions target the rule itself (e.g. "does not overwrite an existing response") rather than any specific route's current shape.

## Key elements

- **`bundle(extra)`** – factory that returns a stub `OpenApiDocument` pre-seeded with `x-app-level-responses` (429/400/415) and a caller-supplied `paths` map; used throughout the `withAppLevelResponses` suite.
- **`withAppLevelResponses` (describe block)** – verifies that app-level responses are merged per `appliesTo` (`all`, `requestBody`, `requestBodyOrBodyless`), that an operation's own response is never overwritten, that non-operation path-item fields (`parameters`, `summary`) are left alone, and that the instruction key is deleted after merge.
- **`stampBundle` / `stampedResult`** – minimal helpers for the `withModuleStamps` suite.
- **`withModuleStamps` (describe block)** – confirms every operation under a mapped path receives `x-module`, paths absent from the map stay unstamped, and non-operation fields are untouched.
- **`errorCodesBundle` / `errorCodesResult`** – minimal helpers for the `withErrorCodes` suite.
- **`withErrorCodes` (describe block)** – checks that the catalogue is published as `x-error-codes` with keys sorted alphabetically, and that a missing `ErrorItem` schema causes a throw.
- **`versionedPath` / `run`** – helpers for the `withVersionedResources` suite.
- **`withVersionedResources` (describe block)** – verifies `ETag` header on 200s of listed reads/writes, `If-Match` parameter + 412 on listed writes, no ETag on listed DELETEs, unlisted operations left alone, and error cases (undeclared method, non-read/write method, `$ref` 200).
- **`run304`** – helper for the `withNotModified` suite (partially visible in the truncated content).
- **`withNotModified` (describe block)** – asserts the shared 304 response is added only to reads that carry `x-cache`.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** – the module under test; every `it` block calls one of its exported transform functions (`withAppLevelResponses`, `withModuleStamps`, `withErrorCodes`, `withVersionedResources`, `withNotModified`, `checkOperationErrorCodes`).
- **`scripts/contracts/openapi-document.ts`** – supplies the `OpenApiDocument` type used to cast all stub documents.
- **`tests/support/stub.ts`** – provides `asStub<T>()`, a cast helper that lets the tests pass plain objects where a full `OpenApiDocument` is expected without runtime validation.

## Notes

- The file imports `checkOperationErrorCodes` from the bundle module, but no corresponding `describe` block is visible in the provided (truncated) content; it may be tested further down or in a separate file.
- All helpers build documents via `asStub` — there is no runtime OpenAPI validation. A structural typo in a stub would surface as a runtime error inside the transform, not as a type error.
- Convention: each transform gets its own set of local helpers and a self-contained `describe` block, so the suite for one function never depends on state set up for another.
- The "never overwrites" and "non-operation field untouched" tests are deliberate guard-rails: the transforms iterate path items and must skip anything that is not an HTTP method key.
