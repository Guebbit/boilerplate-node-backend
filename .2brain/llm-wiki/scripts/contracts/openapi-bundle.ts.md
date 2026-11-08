---
source: scripts/contracts/openapi-bundle.ts
sha256: f978c75b586f63b743fe7c9b4b28ca7e74fad9c9c345a0ae0d067e14e488127e
generated_at: 2026-11-08T02:43:05.353621+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose
Compiles the single committed `openapi.yaml` REST contract from per-module standalone OpenAPI documents. It runs `redocly bundle` (via `execFileSync`) to resolve cross-module `$ref`s, then applies an ordered sequence of in-memory transformation steps (`Step = (document) => void`) to the one parsed object before writing the final YAML. This exists so each module owns a complete, valid document on disk while the published contract remains a single file.

## Key elements
- **`MODULE_ORDER`** — a preference list (not a registry) dictating narrative order; actual membership is discovered from disk.
- **`MODULE_SECTIONS`** — the modules that ship their own `openapi.yaml`, in assembly order (discovered via `modulesWith` + `orderSections`).
- **`SECTION_ORDER`** — all sections a path can be filed under: `'system'` prepended to `MODULE_SECTIONS`.
- **`moduleSpec(section)`** — resolves the on-disk path to a module's `openapi.yaml`.
- **`ROOT_SPEC`** / **`OPENAPI_OUTPUT`** — paths to the root fragment (`shared/contracts/openapi.root.yaml`) and the committed `openapi.yaml`.
- **`sectionPaths(section)`** — returns every path a section declares, in declaration order. Uses a regex (`PATH_LINE`) on the raw file text for modules; parses the root fragment for `'system'`.
- **`withAppLevelResponses`** (exported `Step`) — merges the root's `x-app-level-responses` into every operation that does not already declare that status code, then **deletes** the key from the published document.
- **`withVersionedResources`** (exported `Step`) — reads each path item's `x-versioned` marker; adds `ETag` header to listed read/`put`/`patch` inline 200s and `If-Match` + `412` to listed writes. Throws if a named method is missing or neither read nor write. The marker **stays** in the output.
- **`withNoStoreHeader`** — adds `Cache-Control: no-store` to the `200` of operations whose fragment declares `x-cache: no-store`.
- **`appliesToOperation`** / **`withDefaults`** — internal helpers deciding whether an app-level response entry applies to a given operation (based on `appliesTo`, `requestBody` presence, or write-method membership) and filling missing status codes without overwriting explicit ones.

## Relationships
- **`openapi-document.ts`** — supplies core types (`OpenApiDocument`, `Operation`, `Step`, `OperationEntry`, etc.) and helpers (`parseOpenApi`, `operationsOf`, `isHttpMethod`, `WRITE_METHODS`) used throughout.
- **`root-assembly.ts`** — provides `assembleRoot` (completes the root's path index and tag list from fragments before bundling) and `readModuleFragments`.
- **`fragments.ts`** — `readOpenApiFragment` is used to parse the root spec for `rootPaths()`.
- **`response-headers.ts`** — contributes `withAppLevelHeaders` and `withIdempotentReplay` steps in the pipeline.
- **`openapi-extensions.ts`** — contributes `withExtensionSchemas`, `withUnionExtensions`, `checkExtensions`, and extension-related helpers.
- **`analytics-browser-events.ts`** / **`cookie-auth.ts`** / **`image-upload-encoding.ts`** / **`asyncapi-webhook-events.ts`** / **`fill-enum.ts`** — each contributes a focused `Step` (or helper like `webhookEventNames`) that mutates the bundled document.
- **`personal-data-assembly.ts`** — contributes `stageExportSchema`.
- **`prune-unused.ts`** — contributes `pruneUnused`, the final cleanup step.
- **`bundle-kinds.ts`** — provides the `CompiledBundle` type for the pipeline's intermediate artifact.
- **`bundle-registry.ts`** — registers the bundle kind so other tooling can discover this contract's build.
- **`client-collections-bundle.ts`** — consumes the section/path structure (`SECTION_ORDER`, `sectionPaths`) to group requests by owning module.

## Notes
- Steps mutate the **parsed object**, never the YAML text. The document is parsed once, stepped in order, and stringified once.
- `x-app-level-responses` is deleted after consumption (it is an assembly instruction, not public API); `x-versioned` is intentionally **kept** (it is the machine-readable versioning registry contract tests walk).
- `withEtagHeader` throws if the target `200` is a `$ref` — a sibling of `$ref` is silently ignored by OpenAPI, so a bare `ETag` would be lost. An inline `200` is required.
- `withDefaults` never overwrites: an operation that already declares a status code is left as-is.
- Adding a module is "write its `openapi.yaml`"; deleting is `rm -rf`. No registry file to edit.
- `PATH_LINE` regex (four-space indent) is intentionally textual: path ownership is a property of *which file* declares it, not of the parsed document.
