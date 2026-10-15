---
source: scripts/scaffold/demo-remove-validation-labels.ts
sha256: 434625ef979b74c023a6db75a8ad703b1a582ed21423f8ee7218bdc53779889f
generated_at: 2026-10-15T09:46:33.205913+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-validation-labels.ts

## Purpose

Identifies shared validation-attribute labels (in `src/locales/*.json`) that are named only by a removed module's request contracts and no longer used by any surviving request, then strips those labels from the dictionaries. This keeps the cross-cutting test `tests/cross-cutting/validation-attributes.test.ts` satisfied, which refuses labels that no generated `*Body` schema references.

## Key elements

- **`readRemovedFields(repoRoot, names)`** — Public entry point. Collects every field named anywhere in the removed modules' `openapi*.yaml` contracts, then subtracts every field reachable from surviving modules' and shared contracts' JSON request bodies and query parameters. Returns the orphaned field names as a `ReadonlySet<string>`.
- **`stripValidationLabels(repoRoot, fields)`** — Public entry point. Opens each locale JSON under `src/locales/`, deletes matching keys from `validation.attributes`, and writes the file back. Returns a `RemovalNote[]` describing what was dropped per file.
- **`contractsIn(directory)`** — Loads and parses every `openapi*.yaml` file in a directory; returns `[]` if the directory is absent.
- **`eachObject(node, visit)`** — Recursive depth-first walker over parsed YAML nodes (objects and arrays), invoking `visit` on every plain object.
- **`reachableFields(roots, schemas)`** — Walks from `roots`, collecting `properties` keys and following `$ref` links (resolved by last path segment) into `schemas`, with a `followed` set to guard against cycles.
- **`jsonBody(requestBody)`** — Extracts the `application/json` schema from a `requestBody` node; returns `[]` for multipart or non-JSON bodies.
- **`requestFields(contracts)`** — Aggregates `reachableFields` over all JSON request-body schemas plus all query-parameter names across a set of parsed contracts.
- **`anyFields(contracts)`** — Collects every key under any `properties` object in the contracts (request *or* response).

## Relationships

- **`src/infrastructure/object-guards.ts`** — Provides `isPlainObject`, used throughout for safe type narrowing on parsed YAML/JSON nodes.
- **`scripts/scaffold/demo-remove-registry.ts`** — Source of the `RemovalNote` type that `stripValidationLabels` returns.
- **`scripts/scaffold/demo-remove-modules.ts`** — The orchestrator that removes module folders; this script must run *before* those folders are deleted so their contracts can still be read.
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** — Unit tests covering both exported functions.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Validates the CI wave ordering that sequences this script relative to other removal steps.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Verifies spec identity is preserved after label removal.

## Notes

- **Sequencing is critical.** The module docstring states this must be read *before* the module folders are removed, in the order the authorization script (`demo-remove-authorization.ts`) enforces. Running it after folder deletion means the removed contracts are unreadable and the orphan set will be empty.
- **`$ref` resolution is deliberately shallow.** Only the last path segment of a `$ref` (e.g. `#/components/schemas/Foo` → `Foo`) is looked up in `components.schemas`. This matches how sibling components reference each other in this codebase but would not resolve cross-document references.
- **Multipart bodies are excluded.** `jsonBody` returns `[]` for non-`application/json` content types, so fields carried only via multipart uploads are not counted as "surviving request fields."
- **Locale files are round-tripped via `JSON.stringify(obj, null, 4) + '\n'`.** Any formatting not expressible as 4-space-indented JSON (e.g. trailing commas, key reordering) will be normalized on write.
