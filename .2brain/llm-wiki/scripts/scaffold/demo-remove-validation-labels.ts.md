---
source: scripts/scaffold/demo-remove-validation-labels.ts
sha256: 4cc619439f82517e7257c10e31eb86c6dcd5522d552f95194966914c5dc594bd
generated_at: 2026-10-29T01:42:53.739653+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-validation-labels.ts

## Purpose

Removes shared validation-attribute labels (in `shared/locales/<locale>.json`) whose only consumer was a now-deleted module's request fields. It runs **before** the module folders are physically removed so it can still read their OpenAPI contracts, then edits the locale dictionaries to drop the orphaned labels that `tests/cross-cutting/validation-attributes.test.ts` would otherwise flag.

## Key elements

- **`readRemovedFields(repoRoot, names)`** *(exported)* — Discovers every field name appearing anywhere in the removed modules' `openapi*.yaml` contracts that is **not** reachable from any surviving module's JSON request body or query parameter. Returns a `ReadonlySet<string>` of field names to drop.
- **`stripValidationLabels(repoRoot, fields)`** *(exported)* — For each `shared/locales/*.json` file, deletes every key in `validation.attributes` that appears in `fields`. Returns a `RemovalNote[]` describing what changed.
- **`contractsIn(directory)`** — Parses every `openapi*.yaml` in a directory into an array of YAML documents (empty if the directory is missing).
- **`eachObject(node, visit)`** — Depth-first walker over a parsed YAML tree; invokes `visit` on every plain object encountered.
- **`reachableFields(roots, schemas)`** — Collects all `properties` keys reachable from `roots`, following `$ref` by its last path segment into `schemas`.
- **`jsonBody(requestBody)`** — Extracts the `application/json` schema from a `requestBody` node; returns `[]` for multipart or absent bodies.
- **`requestFields(contracts)`** — Union of `reachableFields` over all JSON body schemas **plus** every `in: query` parameter name across the given contracts.
- **`anyFields(contracts)`** — Every `properties` key anywhere in the contracts (request *and* response), used as the "removed set."
- **`SHARED_LOCALES`** — Constant: `shared/locales` relative to repo root.

## Relationships

- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` for safe type-narrowing of parsed YAML nodes throughout.
- **`scripts/modules-on-disk.ts`** — Imports `modulesWith` to enumerate surviving modules that contain an `openapi.yaml`, which determines the "surviving request" baseline.
- **`scripts/scaffold/demo-remove-registry.ts`** — Imports the `RemovalNote` type used as the return element of `stripValidationLabels`.
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** — Unit-test suite exercising both exported functions.

## Notes

- **Ordering constraint:** The module docstring states this step must run *before* the module folders are deleted and in the sequence dictated by `demo-remove-authorization.ts`. Calling `readRemovedFields` after the folders are gone yields an empty set.
- **`$ref` resolution is shallow:** Only the last path segment (e.g. `#/components/schemas/Foo` → `Foo`) is used to look up a schema. Cross-document or deep-nested refs are not followed.
- **Multipart bodies are excluded:** `jsonBody` returns `[]` for `multipart/form-data`, so fields carried only via multipart uploads will *not* appear in the surviving-request set and may be incorrectly stripped if no other JSON body references them.
- **Serialization contract:** Locale files are rewritten with `JSON.stringify(dict, null, 4) + '\n'`. Any consumer that depends on a different format (e.g. 2-space indent) will see spurious diffs.
- **`anyFields` is intentionally broad:** It captures response-only field names too, so a field that appears solely in a removed module's *response* schema will also be stripped from labels—correct only if no surviving *request* uses that label.
