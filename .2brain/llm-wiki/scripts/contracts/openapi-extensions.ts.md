---
source: scripts/contracts/openapi-extensions.ts
source_sha256: 22371fe31ef43acdc7f355298c857b6d8f63b2f35839d1792ac5a7f340664c5d
context_sha256: e9e6feddf819c8755656dc72e117264c2648bb74e882628c8452d803ae9810ec
generated_at: 2026-11-22T01:58:38.981614+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/openapi-extensions.ts

## Purpose
Lets one module extend another module's open enums and unions through a fragment file of its own (`src/modules/<m>/openapi.<owner>.yaml`), without the owner naming the extension. The fragment carries an `x-extends` map and, for unions, the schemas being added. This file discovers and validates those fragments and provides the bundle steps that apply them. Deleting the extending module removes its fragment, so the owner's contract falls back to its own values and variants. It is used instead of OpenAPI Overlay 1.0, which is OpenAPI-only (AsyncAPI has no twin) and would add a new tool next to the bundler's own `x-` steps.

## Key elements
- `ExtensionFragment` — parsed fragment: `module` (the shipper), `owner` (from the file name), `file`, `extendsSchemas` (schema name to appended values or schema names), and `schemas` (the schemas it adds).
- `extensionFragments(modulesRoot = MODULES_ROOT)` — scans `src/modules/*/openapi.<owner>.yaml`, parses each, and validates the owner. Returns fragments ordered by module name, then file name.
- `enumSourcesOf(fragments)` — merges the appended enum values per schema name, in fragment order, as input for `withFilledEnums`.
- `checkExtensions(fragments)` — a `Step` that rejects an `x-extends` target that is missing from the bundle, or that is neither a `oneOf` nor an enum declaring `x-enum-from: <name>`. It runs before `withFilledEnums`, which consumes the marker.
- `withExtensionSchemas(rootText, fragments, modulesRoot)` — edits the root YAML with the `yaml` Document API. Each fragment schema is added as a `$ref` to the staged fragment file (`../../src/modules/<module>/<file>#/components/schemas/<name>`). Redocly then resolves the refs, so a bad `$ref` fails the bundle as it would anywhere else. It throws if the root already declares the schema.
- `appendVariants(...)` (internal) — pushes `$ref`s onto a union's `oneOf`. If the union has a `discriminator.mapping`, it also adds a mapping entry. The value is read from each variant's `properties.<propertyName>.enum[0]` (`discriminatorValueOf`). It throws on a reused discriminator value.
- Internal helpers: `readFragment`, `requireOwner`, `schemasOf`.
- The file continues past this point with further steps. They include moving fragment schemas to the end of the schema map in fragment order.

## Relationships
- `./extends-map` — supplies `parseExtendsMap` (parses `x-extends`) and `requireDeclared` (checks that named variant schemas are declared in the fragment).
- `./fragments` — `readOpenApiFragment` reads the owner module's contract file to confirm it declares each extended schema.
- `./openapi-document` — supplies the `OpenApiDocument` and `Step` types.
- `./openapi-bundle` — the bundler that runs these as post-bundle steps, like its other `x-` steps. The `withFilledEnums` step (`./fill-enum`) uses `enumSourcesOf`.
- `../modules-on-disk` — provides `MODULES_ROOT`.
- `../../src/infrastructure/object-guards` — provides `isPlainObject`.
- Tests: `tests/unit/scripts/contracts/openapi-extensions.test.ts` covers this module directly. `analytics-browser-events.test.ts` is also related.

## Notes
- Fragment file names must match `openapi.<owner>.yaml`, with the owner in lowercase kebab-case. A file without `x-extends` is silently skipped as another fragment kind. An empty or comment-only file throws, so a module's additions are never dropped silently.
- Owners opt in by shape: an enum declares `x-enum-from: <own name>`, and a union is a `oneOf`.
- Errors are prefixed `[openapi] <file>:` and name the fragment and schema.
- Output YAML from `withExtensionSchemas` uses a 4-space indent and no line wrapping.
