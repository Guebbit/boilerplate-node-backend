---
source: scripts/contracts/openapi-bundle.ts
sha256: 78e7a66505ec325083644ee66da0be01c24dcdd6e3af259191cadb3cd4915799
generated_at: 2026-10-01T12:27:50.336156+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the REST OpenAPI contract from one standalone `openapi.yaml` per module (plus a shared root document) into the single `openapi.yaml` committed at the repo root. It shells out to `redocly bundle`, then runs four post-bundle passes that merge cross-cutting responses, versioning headers, module stamps, and an error-code catalogue into every operation. It also exposes the section/path discovery helpers that other contract tooling (client collections, CI checks) rely on to answer "which module owns which URL?" without re-parsing.

## Key elements

- **`MODULE_SECTIONS`** – ordered list of module names that ship an `openapi.yaml`, computed by intersecting a hard-coded preference list (`MODULE_ORDER`) with disk discovery (`modulesWithOpenapi()`) via `orderSections`.
- **`SECTION_ORDER`** – `['system', …MODULE_SECTIONS]`; the full set of path-owning sections used to group paths and client-collection folders.
- **`moduleSpec(section)`** – returns the absolute path to a module's `openapi.yaml`.
- **`sectionPaths(section)`** – returns every path key a section declares. For `system` it parses the root document and filters out `$ref` pass-throughs; for modules it uses a textual regex (`PATH_LINE`) rather than a YAML parse.
- **`withAppLevelResponses(bundled)`** – injects the root's `x-app-level-responses` (e.g. 429, 400/413/415) into every operation that lacks them; respects `appliesTo: 'requestBody'`; deletes the instruction key before serialising; uses `lineWidth: 0` to avoid diff noise.
- **`withVersionedResources`** *(referenced in header doc; body truncated)* – attaches `ETag` header, `If-Match` parameter, and 412 response to operations on paths marked `x-versioned`. Throws if a versioned GET's `200` is a `$ref` rather than inline.
- **`withModuleStamps`** *(referenced)* – tags every operation with `x-module` derived from its owning fragment.
- **`withErrorCodes`** *(referenced)* – collects each fragment's `x-error-codes` into one catalogue in the bundle.
- **`isBundledDocument` / `isOperation`** – type guards that give early, readable failures on malformed YAML.
- **`operationsOf(document)`** – flattens all HTTP-method operations out of the bundled `paths` map.
- **`assemblesRoot` / `readModuleFragments`** *(imported)* – build the root's path index and tag list from on-disk fragments before `redocly` runs.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** – source of the `REPO_ROOT` constant and the `CompiledBundle` type used throughout this file's I/O.
- **`scripts/contracts/section-order.ts`** – provides `orderSections`, which reconciles the hard-coded preference list against the discovered module set.
- **`scripts/contracts/root-assembly.ts`** – provides `assembleRoot` (completes the root's `paths:` index and tags from fragments before bundling) and `readModuleFragments`.
- **`shared/contracts/openapi.root.yaml`** – the shared preamble, components, `GET /`, and the `x-app-level-responses` / `x-error-codes` instructions that this file reads and consumes during the post-bundle passes.
- **`src/modules/<name>/openapi.yaml`** – per-module standalone documents that are the actual authoring units; this file discovers and reads them but never edits them in place.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** – unit tests for the four post-bundle transforms and path/section helpers.
- **`tests/cross-cutting/contract-bundles.test.ts`** – cross-cutting integration tests exercising the full bundle pipeline.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – exercises the CI wave that invokes this script, verifying section ordering and bundle integrity.

## Notes

- The file is a **build script**, not a library consumed at runtime. Its output (`openapi.yaml` at repo root) is a generated artefact; never hand-edit it.
- `sectionPaths` uses a **textual regex** (`^ {4}(\/\S*):\s*$`) for module files specifically so the answer "which file declares this URL?" is a property of file membership, not of the parsed document. The `system` section is the exception—it parses the root YAML to distinguish real operations from `$ref` pass-throughs.
- `withAppLevelResponses` **never overwrites** an operation's existing response for a given status code; it only fills gaps. An operation declaring its own `429` is treated as more specific.
- `x-app-level-responses` is **deleted** from the output after being applied—consumers of the published contract should not expect it to be present.
- Adding a new module is self-contained: create `src/modules/<name>/openapi.yaml` and it is picked up on the next run. Deleting a module is `rm -rf src/modules/<name>`. No central registry edit is required.
- `lineWidth: 0` in `stringifyYaml` is deliberate: it disables YAML line-folding so that regenerated output produces stable diffs even when unrelated descriptions shift.
