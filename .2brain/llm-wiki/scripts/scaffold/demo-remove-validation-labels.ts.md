---
source: scripts/scaffold/demo-remove-validation-labels.ts
sha256: 4cc619439f82517e7257c10e31eb86c6dcd5522d552f95194966914c5dc594bd
generated_at: 2026-11-08T02:59:09.758859+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-validation-labels.ts

## Purpose

Identifies and removes shared validation-attribute labels (in `shared/locales/<locale>.json`) that are referenced only by a removed module's request fields. This keeps `tests/cross-cutting/validation-attributes.test.ts` green after a module's contract disappears, since that test rejects any label no surviving request uses. Must run **before** the module folders are physically deleted.

## Key elements

- **`readRemovedFields(repoRoot, names)`** (exported) — Scans surviving modules' OpenAPI contracts plus `shared/contracts` to build the set of fields still in use, then scans the removed modules' contracts for all named fields and returns the difference.
- **`stripValidationLabels(repoRoot, fields)`** (exported) — Rewrites every `shared/locales/*.json` file, deleting the `validation.attributes` keys that match `fields`, and returns `RemovalNote[]` entries.
- **`contractsIn(directory)`** — Parses every `openapi*.yaml` in a folder into an array of YAML documents.
- **`eachObject(node, visit)`** — Recursive depth-first walker over any parsed YAML tree, invoking `visit` on each plain object.
- **`reachableFields(roots, schemas)`** — Follows `$ref` (by last path segment) into `components.schemas` and collects every `properties` key reached.
- **`jsonBody(requestBody)`** — Extracts the `application/json` schema from an operation's `requestBody`; returns `[]` for multipart or absent bodies.
- **`requestFields(contracts)`** — Union of fields reachable from JSON request bodies and all query-parameter names across a set of contracts.
- **`anyFields(contracts)`** — All `properties` keys anywhere in a set of contracts (request or response).

## Relationships

- **`scripts/modules-on-disk.ts`** — Imports `modulesWith` to discover which module folders exist and contain an `openapi.yaml`.
- **`scripts/scaffold/demo-remove-registry.ts`** — Imports the `RemovalNote` type; this module's output feeds into the registry's collection of removal actions.
- **`scripts/scaffold/demo-remove-modules.ts`** — The caller/orchestrator that runs `readRemovedFields` *before* invoking folder deletion; the module doc comment explicitly references this ordering.
- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` for safe type-narrowing of parsed YAML/JSON nodes.
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** — Unit tests for both exported functions.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Verifies this script is scheduled in the correct CI wave (before module deletion).
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Exercises spec-identity guarantees that interact with the label-stripping logic.

## Notes

- **Ordering is critical.** `readRemovedFields` must be called while the removed modules' folders still exist on disk; `demo-remove-modules.ts` deletes them. Running this script after deletion will find no removed fields.
- **JSON round-trip fidelity.** `stripValidationLabels` rewrites locale files with `JSON.stringify(obj, null, 4)` + trailing newline. The file format is defined as exactly that serialization, so no other keys shift position.
- **`$ref` resolution is shallow.** Only the last path segment of a `$ref` is used to look up a schema. This matches the convention that fragments reference sibling components by name, but cross-document `$ref`s (e.g., into another file's `#/components/...`) would silently fail to resolve.
- **Multipart bodies are excluded** from `requestFields`. Only `application/json` request bodies contribute fields, mirroring what the client generator exports as `*Body` types.
