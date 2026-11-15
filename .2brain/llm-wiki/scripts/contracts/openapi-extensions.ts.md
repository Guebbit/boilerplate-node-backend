---
source: scripts/contracts/openapi-extensions.ts
sha256: 98477cbe888ea89f484777b9aa220e2f8145eafe13df7a68af53c8311a4dbbc4
generated_at: 2026-11-14T17:27:52.540092+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-extensions.ts

## Purpose

Implements the contract-extension mechanism that lets one module append values to another module's open enums or variants to its `oneOf` unions. It discovers `openapi.<owner>.yaml` fragment files on disk, validates them against the owner's declared schemas, and provides steps that integrate the extensions into the bundled OpenAPI document (enum filling, union variant appending, and redocly-mediated `$ref` resolution).

## Key elements

- **`ExtensionFragment`** (interface) — A parsed fragment: owning module, target owner, file path, `extendsSchemas` map, and added `schemas`.
- **`extensionFragments(modulesRoot?)`** (exported) — Walks `src/modules/*/` for files matching `openapi.<owner>.yaml`, parses them via `readFragment`, and validates ownership via `requireOwner`. Returns fragments sorted by module then file name.
- **`enumSourcesOf(fragments)`** (exported) — Aggregates the values each fragment appends per schema name, for consumption by the enum-filling step.
- **`checkExtensions(fragments)`** (exported, returns a `Step`) — Validates that every `x-extends` target is either a `oneOf` or declares `x-enum-from: <name>`; runs before `withFilledEnums` so the marker is still present.
- **`withExtensionSchemas(rootText, fragments, modulesRoot?)`** (exported) — Inserts each fragment's schemas as `$ref` entries into the root document's `components.schemas` so redocly resolves them; throws on name collision.
- **`readFragment`** (internal) — Parses one YAML file; returns `undefined` if the file lacks `x-extends` (i.e., it is a different fragment kind).
- **`requireOwner`** (internal) — Confirms the owner module ships its own contract file and declares every schema the fragment targets.
- **`appendVariants`** (internal) — Pushes `{$ref}` entries into a union's `oneOf` and updates its `discriminator.mapping`; reads each variant's discriminator value from `properties.<prop>.enum[0]`.
- **`moveToEnd`** (internal) — Reorders fragment schemas to the tail of the schema map so generator output lists extensions last.
- **`FRAGMENT_NAME`** — Regex `/^openapi\.([a-z][a-z0-9-]*)\.yaml$/` used to identify extension files and extract the owner name.

## Relationships

- **`scripts/contracts/extends-map.ts`** — Imports `parseExtendsMap` (validates the `x-extends` shape) and `requireDeclared` (ensures a variant name has a corresponding schema in the fragment).
- **`scripts/contracts/fragments.ts`** — Imports `readOpenApiFragment` to read the owner's contract for validation in `requireOwner`.
- **`scripts/contracts/openapi-document.ts`** — Imports the `OpenApiDocument` and `Step` types; the steps returned by this file are composed into the post-bundle pipeline defined there.
- **`scripts/contracts/openapi-bundle.ts`** — This module runs as a post-bundle step alongside the other `x-` processing steps in the bundle pipeline (referenced in the file's module JSDoc).
- **`scripts/modules-on-disk.ts`** — Imports `MODULES_ROOT` as the default discovery directory.
- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` for runtime narrowing of parsed YAML values.
- **`tests/unit/scripts/contracts/openapi-extensions.test.ts`** — Unit tests exercising the exported functions.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — Tests that exercise extension behavior in the context of the analytics-browser-events contract.

## Notes

- The file explicitly states it is **not** OpenAPI Overlay 1.0; it is a custom `x-` step that works alongside the bundler's own post-bundle processing.
- Extension schemas reach the bundle through **redocly `$ref` resolution**, not a hand-written merge — a broken ref in a fragment fails the bundle identically to a broken ref in any module's own contract.
- The owner module **never names the extension**; removing the extending module's directory automatically reverts the owner's contract to its own values.
- `withExtensionSchemas` uses the `yaml` package's `parseDocument` API (in-place editing) to preserve the root document's shape; output is serialized with `lineWidth: 0, indent: 4`.
- Order of schemas in the final map is semantically meaningful: generators emit declarations in map order, so `moveToEnd` ensures extensions appear last.
- An empty or comment-only fragment file is treated as an error (not silently ignored) to prevent accidental loss of intended extensions.
