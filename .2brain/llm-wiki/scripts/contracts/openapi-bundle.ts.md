---
source: scripts/contracts/openapi-bundle.ts
sha256: e106389a78f8576f8dd56d59c40966aeb098ee14affaf3866b27c77bb79f5a58
generated_at: 2026-10-15T09:38:39.360822+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the monolithic `openapi.yaml` from per-module standalone OpenAPI documents (via `redocly bundle`) and then applies five post-bundle transformations to produce the final published REST contract. It exists so that each module owns a self-contained `openapi.yaml`, adding a module is just dropping a file on disk, and removing one is `rm -rf`.

## Key elements

- **`MODULE_ORDER`** – A preference list (not a registry) controlling the narrative order of sections in the contract and client collections.
- **`MODULE_SECTIONS`** – Discovered from disk via `modulesWith(MODULES_ROOT, 'openapi.yaml')`, ordered by `MODULE_ORDER` through `orderSections`. New modules append alphabetically; deleted ones drop out.
- **`SECTION_ORDER`** – `'system'` followed by `MODULE_SECTIONS`. `system` is the shell (`GET /`) written in the root document.
- **`SectionName`** – Type alias for a section key (`'system'` or a module folder name).
- **`moduleSpec(section)`** – Resolves the on-disk path of a module's `openapi.yaml`.
- **`sectionPaths(section)`** – Returns every path key a section declares. For `system`, parses the root YAML and filters out `$ref` entries; for modules, uses a regex (`PATH_LINE`) to extract path keys textually.
- **`withAppLevelResponses(bundled)`** – Merges the root's `x-app-level-responses` map (e.g. 429, 400/413/415) into every operation that doesn't already declare that status. Never overwrites a route-specific response. Deletes the `x-app-level-responses` key after spending it.
- **`withVersionedResources`** (referenced in header, implementation truncated) – Adds `ETag` header, `If-Match` parameter, and 412 response to operations on paths marked `x-versioned`. Refuses to attach an `ETag` to a `$ref`-based `200`.
- **`withModuleStamps`**, **`withErrorCodes`** – Tag operations with `x-module`; collect all fragments' `x-error-codes` into one catalogue.
- **`withEtagHeader(operation, where)`** – Helper that mutates an operation's inline `200` response to include an `ETag` header; throws if the `200` is a `$ref`.
- **`rootPaths()`** – Parses `openapi.root.yaml`, returns only non-`$ref` path keys (the shell's own operations).
- **`isBundledDocument`**, **`isOperation`**, **`operationsOf`** – Narrowing helpers and a flat iterator over all operations in the bundled document.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Read as `ROOT_SPEC`; supplies the preamble, shared components, `GET /`, and the `x-app-level-responses` / `x-error-codes` instructions.
- **`scripts/contracts/root-assembly.ts`** – Provides `assembleRoot` (completes the root's path index from fragments before redocly runs) and `readModuleFragments`.
- **`scripts/contracts/section-order.ts`** – Provides `orderSections`, which merges the preference list with disk-discovered modules.
- **`scripts/modules-on-disk.ts`** – Provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for disk discovery.
- **`scripts/contracts/fragments.ts`** – Provides `readOpenApiFragment`.
- **`scripts/contracts/bundle-kinds.ts`** – Provides the `CompiledBundle` type.
- **`scripts/contracts/cookie-auth.ts`** – Provides `withCookieAuth` (post-bundle step 1).
- **`scripts/contracts/analytics-browser-events.ts`** – Provides `withBrowserEvents`.
- **`scripts/contracts/personal-data-assembly.ts`** – Provides `stageExportSchema`.
- **`scripts/contracts/prune-unused.ts`** – Provides `pruneUnused`.
- **`scripts/contracts/client-collections-bundle.ts`** – Consumes `SECTION_ORDER` / `sectionPaths` to group requests.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** and **`tests/cross-cutting/contract-bundles.test.ts`** – Unit and integration tests for this file.
- **`src/infrastructure/adapters/logger.ts`** – Used for runtime logging during bundle generation.

## Notes

- Path extraction for modules is intentionally **textual** (regex on raw YAML) rather than parsed, because it is called on every collection regeneration and the answer is a file-level property, not a document-level one.
- `stringifyYaml` is called with `lineWidth: 0` to disable line folding; folded `description:` fields are valid YAML but rewrap on unrelated edits, producing unreadable diffs on every regeneration.
- The bundle is a **generated artefact**; no comments survive `redocly bundle`. All authored documentation lives in the module `openapi.yaml` files.
- `x-app-level-responses` is deleted from the output after merging—it is a build instruction, not consumer-facing contract metadata.
- A `$ref` entry under a path key in the root document is a module path passing through, not a system operation; `rootPaths()` filters these out.
- `withAppLevelResponses` never overwrites an existing status code on an operation—a route that declares its own `429` (e.g. with custom `Retry-After` semantics) is respected.
