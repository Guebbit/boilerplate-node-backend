---
source: scripts/contracts/openapi-document.ts
source_sha256: 0d919cdff011a595de225b47baefa8e0849ef1ff62a06d996fac1204c36e100d
context_sha256: a7eb7db4b01fed43285f93bcffd66325392d7bff0ce76bbe290deea21e318cb2
generated_at: 2026-11-22T01:58:20.627886+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/openapi-document.ts

## Purpose
Shared foundation for the contract-bundling steps that operate on the bundled `openapi.yaml`. It defines the document type, the list of HTTP methods an operation can sit under, a parse guard, and a single walk over all operations, so no step keeps its own copy of "what an OpenAPI document looks like". Types and the method list come from `openapi-types`; YAML parsing uses `yaml`.

## Key elements
- `OpenApiDocument`: an OpenAPI 3.1 document (`OpenAPIV3_1.Document`) extended with the vendor keys the steps read and write.
  - Operation-level: `x-cache`, `x-module` (stamped by the bundler), `x-error-codes` (codes by HTTP status).
  - Root-level: `x-app-level-responses`, `x-app-level-headers`, `x-image-upload-types`, `x-error-codes`, `x-tagGroups`. The `unknown`-typed ones are validated by the step that reads them.
- `Step`: `(document: OpenApiDocument) => void`. A bundler step that edits the parsed document in place. The bundler parses once, runs the steps in order, then stringifies once.
- `Operation` and `OperationEntry`: an operation object, and an operation paired with its `route` and `method`.
- `AppLevelResponse`: an entry of `x-app-level-responses`, with the shared `response` name and `appliesTo` (`'all' | 'requestBody' | 'requestBodyOrBodyless'`).
- `ErrorCodeEntry`: an error code's `status`, `description` and optional `scope: 'app'`. `app` marks a code any operation may send. Every code without it must be listed on at least one operation's `x-error-codes`.
- `HTTP_METHODS`: the methods a path item may hold an operation under, taken from `OpenAPIV3.HttpMethods`.
- `WRITE_METHODS`: `post`, `put`, `patch`, `delete`, the methods a client may send a body to.
- `isHttpMethod(key)`: type guard telling HTTP-method keys apart from `parameters`, `summary`, `$ref` and similar.
- `parseOpenApi(bundled)`: parses YAML text and throws `[openapi] the bundled document did not parse to an object.` unless the result is a non-array object.
- `operationsOf(document)`: flattens `paths.<route>.<method>` into `OperationEntry[]`.
- `securityOpenMethods(pathItem)`: upper-case methods whose operation declares `security: []`, in `HTTP_METHODS` order.

## Relationships
The neighbors listed are the `scripts/contracts/*` step modules (analytics-browser-events, cookie-auth, fill-enum, generate-redirect-query, generate-request-content-types, image-upload-encoding, openapi-bundle, openapi-extensions, permission-security, prune-unused, response-headers) and their unit tests under `tests/unit/scripts/contracts/`. They sit in the dependency graph around this file, which is the common base for the document type, `Step` and operation walking. The file itself imports only `openapi-types` and `yaml`.

## Notes
- `parseOpenApi` does only a shallow object check, then casts to `OpenApiDocument`. The steps that read each extension check its structure.
- `securityOpenMethods` counts only an empty `security` array. An omitted `security`, or a list of schemes such as `[{}, bearerAuth]`, does not count as "no sign-in".
- `operationsOf` skips path-item keys that are not HTTP methods, so `parameters`, `summary` and `$ref` never collect responses.
