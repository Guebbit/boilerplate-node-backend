---
source: scripts/scaffold/demo-remove-validation-labels.ts
sha256: cc88d787b4af7b8720f7f81c66ae033e79233e9ce0060fe21456aed14a8157aa
generated_at: 2026-11-14T17:40:58.497925+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-validation-labels.ts

## Purpose

Cleans up the shared locale dictionaries (`shared/locales/<locale>.json`) after a module is removed. The cross-cutting test `tests/cross-cutting/validation-attributes.test.ts` rejects any `validation.attributes` label that no surviving request field uses, so this module identifies which labels belong *only* to the removed module and strips them from every locale file before the module folders are deleted.

## Key elements

- **`readRemovedFields(repoRoot, names)`** — *exported.* Computes the set of field names that appear in the removed modules' contracts but are **not** carried by any surviving module's JSON request body or query parameter. Must be called while the removed module folders still exist on disk.
- **`stripValidationLabels(repoRoot, fields)`** — *exported.* For each field in the set, deletes its key from `validation.attributes` in every `shared/locales/*.json` file. Returns an array of `RemovalNote` objects describing what was removed and where.
- **`contractsIn(directory)`** — *internal.* Parses all `openapi*.yaml` files in a given directory into an array of YAML objects.
- **`eachObject(node, visit)`** — *internal.* Depth-first walker over any parsed YAML/JSON node; invokes `visit` once per plain-object encountered.
- **`reachableFields(roots, schemas)`** — *internal.* Collects every `properties` key reachable from `roots`, following `$ref` links (matched by last path segment) into `components.schemas`.
- **`jsonBody(requestBody)`** — *internal.* Extracts the `application/json` schema from a `requestBody` object; returns `[]` for multipart or other content types.
- **`requestFields(contracts)`** — *internal.* Computes the full set of fields a group of contracts' requests can carry (JSON body fields + query parameter names).
- **`anyFields(contracts)`** — *internal.* Collects every field name anywhere in a set of contracts (request *and* response).

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `modulesWith` to discover surviving modules (used to build the "surviving" contract set).
- **`src/infrastructure/object-guards.ts`** — imports `isPlainObject` for runtime type-narrowing of parsed YAML/JSON nodes throughout the file.
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type used as the return type of `stripValidationLabels`.
- **`scripts/scaffold/demo-remove-modules.ts`** — this file must run **before** `demo-remove-modules` deletes module folders; it reads those folders' contracts while they still exist.
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** — unit tests covering both exported functions.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the CI wave ordering that constrains when this step runs relative to folder deletion.

## Notes

- **Ordering is critical.** The module doc explicitly states `readRemovedFields` must be called *before* the module folders are removed. Calling it after deletion will silently produce an empty set.
- **JSON formatting assumption.** `stripValidationLabels` writes files back as `JSON.stringify(obj, null, 4) + '\n'`. This is a lossless round-trip *only* if the file was originally formatted exactly that way; any custom indentation or key ordering in the locale file will be normalized.
- **`$ref` resolution is shallow.** Only the last segment of a `$ref` path is used to look up a schema. This matches the repo convention where fragments name siblings by component name, but it will silently miss cross-document `$ref`s.
- **Multipart bodies are excluded.** `jsonBody` only picks up `application/json` schemas; fields carried solely in multipart request bodies will not appear in the "surviving" set and could be incorrectly flagged as removable.
