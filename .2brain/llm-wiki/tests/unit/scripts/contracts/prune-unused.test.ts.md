---
source: tests/unit/scripts/contracts/prune-unused.test.ts
sha256: 2abb1dbb75cdf5bd41428b7b0a0968d27a50f698ec004bb211e1c719a6659354
generated_at: 2026-11-08T10:34:33.960434+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/prune-unused.test.ts

## Purpose

Unit tests for the `pruneUnused` contract step. Verifies that a single-pass sweep over an OpenAPI document removes every unreachable component (schemas, parameters, responses, security schemes, tags, tag groups) while preserving everything reachable from an operation—directly or transitively through other components.

## Key elements

- **`BUNDLE`** — A single OpenAPI 3.1.0 fixture string. Deliberately plants one "orphan" of every kind (unused schema, parameter, response, security scheme, tag, tag group) alongside a fully-referenced chain (`/things` → `Thing` → `Part`, `Page` param, `bearerAuth` scheme, `Used` tag, `Kept` group).
- **`pruned()`** — Local helper. Parses `BUNDLE` via `parseOpenApi`, runs `pruneUnused(document)` (in-place mutation), and returns a loose `{ tags, groups, components }` shape so assertions don't need the full document.
- **`describe('pruneUnused')`** — Six `it` cases covering:
  - transitive schema reachability (`Thing` → `Part` kept),
  - dropping a schema reachable *only* from an already-orphaned component (`Lonely`),
  - emptying an unused component kind (`responses` → `{}`),
  - keeping a named security scheme vs. dropping an unnamed one,
  - dropping an unused tag,
  - removing a pruned tag from its `x-tagGroups` entry and deleting the group if it becomes empty.

## Relationships

- **`scripts/contracts/openapi-document.ts`** — Provides `parseOpenApi`, used by the `pruned()` helper to turn the `BUNDLE` string into the document object that `pruneUnused` mutates.
- **`scripts/contracts/prune-unused.ts`** — Provides `pruneUnused`, the function under test. Called with the parsed document; mutates it in place (no return value consumed).

## Notes

- `pruneUnused` is a **mutating** function; the test never assigns its return value.
- The fixture uses `$ref` chains (`Thing` → `Part`, `Lonely` → `Part`) specifically to exercise *transitive* reachability, not just direct references.
- Assertions use `toSorted()` (non-mutating) rather than `sort()` to avoid side-effects on the object under test.
- The `x-tagGroups` entries reference tags by name (string array), not `$ref`, which is why the test asserts on plain string arrays rather than objects.
