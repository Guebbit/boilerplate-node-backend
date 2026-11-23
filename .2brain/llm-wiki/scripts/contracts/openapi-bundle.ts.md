---
source: scripts/contracts/openapi-bundle.ts
source_sha256: f709a2f64e4f574e3d49b1736b24e5782b10c21437ed301616fd759e5a798279
context_sha256: 7f54cec45697f4ae75bb66c8092ad7003603dcded3f225f5db72a5d94d7363d0
generated_at: 2026-11-22T01:58:04.940299+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/openapi-bundle.ts

## Purpose
Builds the committed REST contract `openapi.yaml`. Each module owns a standalone `src/modules/<name>/openapi.yaml`, and shared parts live in `shared/contracts/openapi.root.yaml`. This file compiles them with `redocly bundle` rather than by concatenation. The bundle is parsed once, edited in place by an ordered list of `Step`s (`(document) => void`), and stringified once. Steps never touch text.

## Key elements
- **`MODULE_ORDER`** (private): preferred narrative order of modules. It is a preference, not a registry.
- **`MODULE_SECTIONS`**: modules that ship an `openapi.yaml`, discovered from disk via `modulesWith` and ordered with `orderSections`.
- **`SECTION_ORDER`** / **`SectionName`**: `'system'` followed by `MODULE_SECTIONS`. `system` has no folder; it is `GET /` and other paths declared in the root document.
- **`moduleSpec(section)`**: path to a module's `openapi.yaml`.
- **`sectionPaths(section)`**: the paths a section declares, in declaration order. For modules it uses a textual regex (`PATH_LINE`) over the file. For `system` it reads the root fragment's `paths`.
- **`withAppLevelResponses`** (`Step`): merges the root's `x-app-level-responses` into every operation. It never overwrites an operation's own response and only applies a response where `appliesToOperation` allows. It throws if the key is missing, then deletes the key from the output.
- **`withDefaults` / `appliesToOperation`** (private): fill missing responses. `appliesTo` is `all`, or based on whether the operation declares a `requestBody`. `requestBodyOrBodyless` also covers every write method.
- **Versioned-resource helpers** (`withEtagHeader`, `withAnswerHeaders`, `withIfMatch`, `withVersionedResources`): act on a path item's `x-versioned: [methods]` marker.
  - `get`: `ETag` on the inline 200.
  - `post`: `ETag` plus `Content-Location` on every inline 2xx.
  - `put`/`patch`/`delete`: `If-Match` parameter plus a `412` response.
  - A `$ref` response, or a missing one, throws, because a sibling of `$ref` is ignored.
  - The marker stays in the published contract.
  - The code that wires these up is beyond the portion of the file shown here.
- **Constants**: `ROOT_SPEC` (`shared/contracts/openapi.root.yaml`) and `OPENAPI_OUTPUT` (`<repo>/openapi.yaml`).

## Relationships
- Imports the per-concern step modules whose names say what they add:
  - `analytics-browser-events` (`withBrowserEvents`)
  - `cookie-auth` (`withCookieAuth`)
  - `permission-security` (`withPermissionErrorCodes`)
  - `image-upload-encoding` (`withImageUploadEncoding`)
  - `fill-enum` (`withFilledEnums`)
  - `response-headers` (`withAppLevelHeaders`, `withIdempotentReplay`)
  - `personal-data-assembly` (`stageExportSchema`)
  - `prune-unused` (`pruneUnused`)
  - `openapi-extensions` (`checkExtensions`, `enumSourcesOf`, `extensionFragments`, `withExtensionSchemas`, `withUnionExtensions`)
- `asyncapi-webhook-events` supplies `webhookEventNames`.
- `openapi-document` supplies the document and step types (`Step`, `Operation`, `OpenApiDocument`, …), `parseOpenApi`, `operationsOf`, `WRITE_METHODS` and `isHttpMethod`.
- `fragments` supplies `readOpenApiFragment`, used to read the root's paths.
- `bundle-kinds` supplies the `CompiledBundle` type.
- `section-order` supplies `orderSections`.
- `root-assembly` supplies `assembleRoot` and `readModuleFragments`.
- `../modules-on-disk` supplies `REPO_ROOT`, `MODULES_ROOT` and `modulesWith`.
- `bundle-registry` and `client-collections-bundle` are graph neighbors, but their interaction is not visible in the shown portion. The client collections do consume the `SECTION_ORDER` / `sectionPaths` grouping, according to comments in this file.

## Notes
- `assembleRoot` adds every module's paths and tags to the root from the on-disk fragments before redocly runs. Adding a module therefore means adding its `openapi.yaml`, and deleting one means removing its folder.
- Anything used by two or more modules belongs in `openapi.root.yaml` and is reached by `$ref`.
- `PATH_LINE` expects path keys indented by exactly four spaces. Ownership is a property of the file a path is written in, not of the parsed document.
- Steps run on the bundled document, where `$ref`s are already resolved and each operation appears once.
