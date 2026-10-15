---
source: tests/unit/scripts/contracts/prune-unused.test.ts
sha256: df9aea9f57d6d54007fa17528c784bd0226bcd248788b1cb8f3bbced2471248e
generated_at: 2026-10-15T13:26:31.753399+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/prune-unused.test.ts

## Purpose

Unit tests for the `pruneUnused` function, verifying that it correctly removes unreachable components (schemas, parameters, responses, security schemes, tags) from an OpenAPI 3.1.0 bundle while preserving everything reachable from at least one path operation.

## Key elements

- **`BUNDLE`** — A single OpenAPI 3.1.0 YAML string fixture containing a mix of used and orphaned components across every kind (`schemas`, `parameters`, `responses`, `securitySchemes`, `tags`). Serves as the canonical input for all tests.
- **`pruned()`** — Helper that runs `pruneUnused(BUNDLE)` and parses the resulting YAML string into a typed object (`tags` + `components`). Used by every assertion.
- **`describe('pruneUnused')`** — Six test cases covering:
  - Transitive reachability (a schema referenced by another retained schema survives).
  - A component referenced *only* by an already-orphaned component is dropped.
  - An entire component kind with no remaining entries is reduced to `{}`; an unused response object is removed.
  - Security schemes named in a `security` requirement are kept; unnamed ones are dropped.
  - Tags not referenced by any operation are removed.
  - Input that does not parse to a YAML object throws with a specific message.

## Relationships

- **`scripts/contracts/prune-unused.ts`** — The module under test. `pruneUnused` is imported directly and is the sole subject of every assertion in this file.

## Notes

- The fixture deliberately includes a transitive chain (`Thing` → `Part`) *and* a component (`Lonely`) that references `Part` but is itself unreferenced, to distinguish "reachable through a live component" from "reachable only through a dead one."
- `pruned()` parses the output with the `yaml` package, so assertions operate on the *semantic* structure, not raw string matching.
- The non-object test uses a YAML list (`- just\n- a list`) to exercise the guard that `pruneUnused` applies before traversal.
