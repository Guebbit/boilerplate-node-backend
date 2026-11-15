---
source: scripts/contracts/openapi-document.ts
sha256: c2d3384bfad4d50ab6c45bb2c0845e1b20a2f2e0ac8a3b59d1512fb3557ca0fb
generated_at: 2026-11-14T17:27:24.465566+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-document.ts

## Purpose

Shared type definitions and two utility functions that every OpenAPI bundler step depends on. It defines the `OpenApiDocument` type (an OpenAPI 3.1 document augmented with the project's vendor extensions), the `Step` function signature, and provides the single YAML parse guard and the single operation-walk so no step re-implements either.

## Key elements

- **`OpenApiDocument`** — `OpenAPIV3_1.Document<OperationExtensions>` intersected with `RootExtensions`. The canonical document type all steps read and mutate.
- **`Step`** — `(document: OpenApiDocument) => void`. The contract every bundler step implements; it edits the parsed document in place.
- **`Operation`** / **`OperationEntry`** — typed views of a single operation and of `{ route, method, operation }` respectively.
- **`OperationExtensions`** — vendor keys an operation may carry: `x-cache`, `x-module`, `x-error-codes`.
- **`RootExtensions`** — vendor keys on the document root: `x-app-level-responses`, `x-app-level-headers`, `x-image-upload-types`, `x-error-codes`, `x-tagGroups`.
- **`AppLevelResponse`** / **`ErrorCodeEntry`** — shapes for the root-level `x-app-level-responses` and `x-error-codes` maps.
- **`HTTP_METHODS`** — readonly array of all `OpenAPIV3.HttpMethods` values; used by `operationsOf` and `securityOpenMethods` to enumerate only real operations.
- **`WRITE_METHODS`** — `['post', 'put', 'patch', 'delete']`; the methods a client may send a body to.
- **`isHttpMethod(key)`** — type-guard distinguishing a method key from other path-item keys (`parameters`, `summary`, `$ref`).
- **`parseOpenApi(bundled)`** — parses YAML text into `OpenApiDocument`; throws a descriptive `Error` if the result is not a plain object.
- **`operationsOf(document)`** — flattens `document.paths` into `OperationEntry[]` (one entry per `paths.<route>.<method>` that holds an operation object).
- **`securityOpenMethods(pathItem)`** — returns the upper-cased methods on a path item whose operation declares `security: []` (no authentication required).

## Relationships

- **`openapi-bundle.ts`** — the orchestrator that calls `parseOpenApi` once, then runs an array of `Step` values in sequence and stringifies the result. Every other contract file is one of those steps.
- **`openapi-extensions.ts`** — a step that reads and writes the `OperationExtensions` / `RootExtensions` keys defined here.
- **`permission-security.ts`** — a step that consumes `securityOpenMethods` to identify auth-exempt operations.
- **`analytics-browser-events.ts`**, **`cookie-auth.ts`**, **`fill-enum.ts`**, **`generate-redirect-query.ts`**, **`generate-request-content-types.ts`**, **`image-upload-encoding.ts`**, **`prune-unused.ts`**, **`response-headers.ts`** — individual `Step` implementations that import `OpenApiDocument`, `Operation`, `HTTP_METHODS`, `WRITE_METHODS`, `operationsOf`, or `isHttpMethod` from this file.

## Notes

- `parseOpenApi` does **not** validate the document against an OpenAPI schema; structural checking is deferred to whichever step first reads a given key. A malformed document will therefore fail at the step that touches the bad field, not at parse time.
- `securityOpenMethods` treats only `security: []` (an empty array) as "no auth". An operation that *omits* the `security` field, or lists schemes like `[{}, bearerAuth]`, is **not** considered open.
- The `Step` type mutates the document in place and returns `void`. The bundler parses once, runs steps sequentially, and stringifies once — steps never see YAML text.
- Types and the `HttpMethods` enum are re-exported from `openapi-types` (the same package Modelina already depends on), so no step maintains its own copy of the OpenAPI shape.
