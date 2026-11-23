---
source: scripts/scaffold/demo-remove-validation-labels.ts
generated_at: 2026-11-22T02:15:23.675320+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-validation-labels.ts

## Purpose
When a demo scaffold removes modules, this file finds the shared validation labels (`validation.attributes` in `shared/locales/<locale>.json`) that only the removed modules' request fields used, and deletes them. This keeps `tests/cross-cutting/validation-attributes.test.ts` passing, since that test refuses any label nothing uses. The fields must be read before the module folders are deleted.

## Key elements
- `readRemovedFields(repoRoot, names)` (exported): returns the set of field names that the removed modules' `openapi*.yaml` contracts mention anywhere (request or response) and that no surviving request carries. "Surviving" means the surviving modules' contracts plus `shared/contracts`. It must run while the removed folders still exist.
- `stripValidationLabels(repoRoot, fields)` (exported): for each `shared/locales/*.json`, deletes the matching keys from `validation.attributes`. It rewrites the file only if something was dropped, and returns one `RemovalNote` (`{ file, detail }`) per changed file.
- `requestFields` (internal): approximates what the validation-attributes test reads from the generated `*Body` schemas. It collects every field reachable from an `application/json` request body, plus every query parameter name. Multipart bodies are not counted.
- `reachableFields` (internal): collects `properties` keys under the given roots. It follows each `$ref` into the component `schemas` by its last path segment, and tracks visited targets to avoid loops.
- `anyFields` (internal): collects every `properties` key in the contracts, regardless of where it appears.
- `contractsIn`, `eachObject`, `jsonBody` (internal): contracts loading and traversal helpers. `contractsIn` parses the `openapi*.yaml` files in a folder, `eachObject` walks a parsed YAML tree depth first, and `jsonBody` extracts a JSON request-body schema.

## Relationships
- `scripts/modules-on-disk.ts`: `modulesWith(modulesRoot, 'openapi.yaml')` lists the modules on disk that have a contract, which gives the survivors.
- `scripts/scaffold/demo-remove-registry.ts`: provides the `RemovalNote` type that `stripValidationLabels` returns.
- `src/infrastructure/object-guards.ts`: `isPlainObject` is used throughout the YAML traversal.
- `scripts/scaffold/demo-remove-modules.ts`: part of the same removal scaffold.
- `tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`: unit tests for this file.
- `tests/unit/scripts/mutation/ci/waves.test.ts`: listed as a neighbor in the graph. Nothing in this file shows how the two interact.

## Notes
- The JSON rewrite assumes the locale files are exactly `JSON.stringify(..., null, 4)` plus a trailing newline, so nothing else in them changes.
- A label is removed only if a removed module names the field and no surviving request does. A field that survives only in a response does not keep its label.
- The `$ref` handling is deliberately simple: it follows only the last path segment, which is how fragments name a sibling's component. Schema names are merged across all contracts into one namespace.
- The module header says the read-before-delete ordering follows the one kept by `demo-remove-authorization.ts`.
