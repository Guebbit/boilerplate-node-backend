---
source: tests/cross-cutting/contract-responses-never-null.test.ts
sha256: e1ad0413bbe8f694d13c968f0d27a7632abf5d434f2dfdd67ab55cc8fda15c42
generated_at: 2026-11-08T09:25:45.988159+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-responses-never-null.test.ts

## Purpose

Enforces the read-side half of the empty-value rule: no response schema in the bundled OpenAPI contract may admit `null`. `null` is treated as a write verb (PUT/PATCH "clear this"); a response signals absence by omitting the key. The test recursively walks every operation's response schemas and asserts none allow `null`.

## Key elements

- **`Node`** — union type covering every shape the walker may encounter (object, array, scalar, null, undefined).
- **`resolveRef(root, ref)`** — resolves a JSON-pointer `$ref` (e.g. `#/components/schemas/Foo`) by traversing the in-document object.
- **`admitsNull(node)`** — returns `true` if `node.type` is `'null'` or an array containing `'null'`.
- **`nullableSchemas(root, node, at, seen)`** — recursive walk returning paths where null is admitted; follows `$ref`s once each (tracked via `seen` to break self-referential cycles).
- **`nullableInResponses()`** — entry point: iterates `spec.paths → methods → responses` and collects all nullable locations.
- **Test 1** — asserts `nullableInResponses()` is empty.
- **Test 2** — sanity check: walks `UpdateInventoryLevelRequest` (a *request* schema) and asserts null *is* found, proving the walker is not blind.

## Relationships

- **`tests/support/spec-walk.ts`** — provides `readSpec()`, which loads/parses the bundled OpenAPI document. This test's only runtime import.
- The file's doc comment references **`tests/support/response-contract.ts`** as the complementary walker for free-form (`additionalProperties: true`) response bodies; that file is not imported here.

## Notes

- Only **local** `$ref`s (JSON pointers into the same document) are resolved; external or fragment-external refs would not be followed.
- Free-form schemas are explicitly **out of scope** here — their null-safety is enforced by `response-contract.ts`.
- The `seen` set is shared across the entire `nullableInResponses()` call, so a `$ref` that appears in multiple operations is resolved once and then skipped on subsequent encounters.
- Request-body schemas are intentionally *not* judged; they may legitimately use `type: 'null'` for the "clear" write verb.
