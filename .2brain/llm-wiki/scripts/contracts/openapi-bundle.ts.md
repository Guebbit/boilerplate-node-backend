---
source: scripts/contracts/openapi-bundle.ts
sha256: aef9a6114d682291ac82b33eda988b7a5e983a90eded8e81842cd6d5dd2cb3e4
generated_at: 2026-11-14T17:26:59.965289+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the project's single REST contract (`openapi.yaml`) from per-module standalone OpenAPI documents. It invokes `redocly bundle` to merge the module files with the shared root, then applies an ordered list of in-place transformation steps (`bundleSteps`) to the one parsed document before writing the final artifact. This exists so that adding or removing a module is simply adding or deleting a folder, and so that cross-cutting concerns (default responses, versioning headers, enum filling, extension schemas) are applied once, uniformly, after `$ref` resolution.

## Key elements

- **`MODULE_ORDER` / `MODULE_SECTIONS`** — Narrative ordering of modules; `MODULE_SECTIONS` is the subset actually discovered on disk (via `modulesWith(MODULES_ROOT, 'openapi.yaml')`).
- **`SECTION_ORDER` / `SectionName`** — All sections a path can belong under: `'system'` first, then the discovered modules.
- **`moduleSpec(section)`** — Resolves the filesystem path to a module's `openapi.yaml`.
- **`sectionPaths(section)`** — Returns the paths a section declares. For `'system'` it parses the root document and filters out `$ref` entries; for modules it regex-matches the four-space-indented path keys in the raw YAML (a file-ownership question, not a document question).
- **`withAppLevelResponses`** (exported `Step`) — Injects the root's `x-app-level-responses` defaults into every operation that lacks its own, then deletes the key from the document. Never overwrites an operation's own declared response.
- **`appliesToOperation` / `withDefaults`** — Determine applicability (by `requestBody` presence or write-verb membership) and merge the `$ref` into the operation's `responses` map.
- **`withVersionedResources`** (referenced, body truncated) — Applies each path item's `x-versioned` marker: adds `ETag` to listed read `200`s, `ETag` + `Content-Location` to listed `post` 2xx, and `If-Match` + `412` to listed `put`/`patch`/`delete`. Requires inline (non-`$ref`) responses and throws otherwise.
- **`withEtagHeader` / `withAnswerHeaders` / `withIfMatch`** — Helpers the versioned step calls per operation.
- **`bundleSteps`** (referenced in the doc-comment, body truncated) — The ordered array of `(document) => void` steps applied after bundling.
- **`ROOT_SPEC` / `OPENAPI_OUTPUT`** — Filesystem paths for the shared root spec and the committed output file.
- **`PATH_LINE`** — Regex `/^ {4}(\/\S*):\s*$/gm` used to extract path keys textually.

## Relationships

- **`openapi-document.ts`** — Source of core types (`OpenApiDocument`, `Operation`, `OperationEntry`, `AppLevelResponse`, `Step`) and utilities (`parseOpenApi`, `operationsOf`, `WRITE_METHODS`, `isHttpMethod`). This file is the primary type/parse layer.
- **`bundle-kinds.ts`** — Provides the `CompiledBundle` type used to describe the output artifact.
- **`fragments.ts`** — `readOpenApiFragment` is used to parse the root spec and module fragments without full `redocly` invocation.
- **`openapi-extensions.ts`** — Supplies `checkExtensions`, `withExtensionSchemas`, `withUnionExtensions`, `extensionFragments`, `enumSourcesOf`; consumed as steps or validation in the bundle pipeline.
- **`fill-enum.ts`** — `withFilledEnums` step resolves `$ref` enums into inline values.
- **`response-headers.ts`** — `withAppLevelHeaders` and `withIdempotentReplay` are steps in the pipeline.
- **`cookie-auth.ts`** — `withCookieAuth` step injects the shared auth scheme.
- **`permission-security.ts`** — `withPermissionErrorCodes` step adds permission-related error responses.
- **`image-upload-encoding.ts`** — `withImageUploadEncoding` step documents encoding constraints on upload endpoints.
- **`analytics-browser-events.ts`** — `withBrowserEvents` step merges the browser-event contract.
- **`asyncapi-webhook-events.ts`** — `webhookEventNames` is referenced to keep webhook operation names consistent.
- **`personal-data-assembly.ts`** — `stageExportSchema` stages the personal-data export schema into the bundle.
- **`prune-unused.ts`** — `pruneUnused` is the final step that removes components no longer reachable after all other edits.

## Notes

- Steps mutate the single parsed object in place (`(document) => void`) and never touch YAML text. The document is stringified exactly once, after all steps.
- `x-app-level-responses` is an **assembly instruction** and is deleted from the published output; the `x-versioned` marker, by contrast, **stays** in the published contract as a machine-readable index of versioned resources.
- `withAppLevelResponses` fills gaps only — an operation that already declares a given status code (e.g. its own `429` with custom `Retry-After`) is left untouched.
- Versioned-resource helpers **refuse** `$ref` responses with a thrown error rather than silently skipping; a `200: { $ref: … }` on a versioned path is a contract bug.
- `sectionPaths` for modules is intentionally textual (regex on raw YAML) because "which file owns this URL" is a file-ownership question, independent of the parsed document's `$ref` graph.
- The bundle is produced by spawning `redocly bundle` via `execFileSync`, not by string concatenation, so authored comments in module files are preserved.
