---
source: scripts/contracts/openapi-document.ts
sha256: c8694662d63996cebd3acae4db6f49712925a6513f93da530c7f4c57bbb0d737
generated_at: 2026-11-08T02:43:18.600583+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-document.ts

## Purpose

Shared foundation for the OpenAPI bundler pipeline. Defines the document type, the `Step` contract, and a small set of utilities (parse, flatten operations, detect security-open methods) that every bundler step relies on so they don't each re-import `openapi-types` or re-implement the walk over `paths`.

## Key elements

- **`OpenApiDocument`** — The canonical document type: `OpenAPIV3_1.Document<OperationExtensions>` intersected with `RootExtensions` (the vendor keys the pipeline reads/writes).
- **`Step`** — `(document: OpenApiDocument) => void`. The signature every bundler step implements; steps mutate the parsed object in place.
- **`OperationExtensions`** — Declares `x-cache`, `x-module`, `x-error-codes` on operations.
- **`RootExtensions`** — Declares root-level vendor keys: `x-app-level-responses`, `x-app-level-headers`, `x-image-upload-types`, `x-error-codes`, `x-tagGroups`.
- **`AppLevelResponse` / `ErrorCodeEntry`** — Typed shapes for the root `x-app-level-responses` and `x-error-codes` maps.
- **`OperationEntry`** — `{ route, method, operation }` tuple returned by the flattening helper.
- **`HTTP_METHODS`** — `readonly OpenAPIV3.HttpMethods[]` derived from the enum; used for iteration and type-guards.
- **`WRITE_METHODS`** — `['post','put','patch','delete']`; the methods that may carry a request body.
- **`isHttpMethod(key)`** — Type guard distinguishing operation keys from non-operation path-item keys (`parameters`, `summary`, `$ref`).
- **`parseOpenApi(bundled)`** — Parses YAML text into an `OpenApiDocument`; throws a descriptive `Error` if the result is not a plain object.
- **`operationsOf(document)`** — Flattens `document.paths` into an array of `OperationEntry` (one per `route × method` that holds an operation object).
- **`securityOpenMethods(pathItem)`** — Returns the upper-cased methods whose operation declares `security: []` (explicitly open, no auth).

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — The orchestrator. Calls `parseOpenApi` once, then runs an ordered list of `Step`s, then stringifies the result. This file is its shared vocabulary.
- **All step scripts** (`analytics-browser-events.ts`, `cookie-auth.ts`, `fill-enum.ts`, `generate-redirect-query.ts`, `generate-request-content-types.ts`, `image-upload-encoding.ts`, `prune-unused.ts`, `response-headers.ts`, `openapi-extensions.ts`) — Each implements `Step` and imports `OpenApiDocument`, `operationsOf`, `HTTP_METHODS`, `isHttpMethod`, or `securityOpenMethods` from this file.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** — Exercises the full pipeline, indirectly covering `parseOpenApi` and the step contract.

## Notes

- `OpenApiDocument` is an intersection type (`&`), not a refinement of `OpenAPIV3_1.Document`. The vendor keys are optional and sit alongside standard keys.
- `securityOpenMethods` deliberately returns an **empty** array for operations that *omit* `security` or list schemes (e.g. `[{}, bearerAuth]`); only an explicit `[]` counts as "fully open."
- `parseOpenApi` does **no** structural validation beyond "is an object." Shape-checking is delegated to the individual steps that read specific fields.
- The module is `@module`-level (no named default export); all exports are named.
