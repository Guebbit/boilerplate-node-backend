---
source: scripts/contracts/prune-unused.ts
sha256: 2c500fab96fee66dd55feee3f328837c91a3ee609b017659af632277b6a3adc7
generated_at: 2026-11-14T17:28:30.732846+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/prune-unused.ts

## Purpose

Final pipeline step that removes every OpenAPI component no operation or other component references, plus every tag no operation uses. It exists because deleting an API module orphans its components (security schemes, schemas, responses) in the shared root document, and the published contract must not describe what the deployment no longer has.

## Key elements

- **`pruneUnused`** (exported `Step`) — Entry point. Computes reachability, then deletes unreferenced components and unused tags in-place on the `OpenApiDocument`.
- **`reachable`** — Splits the document into `components` and everything else, collects external refs, then iteratively (queue-based) follows refs *through* components to find the full transitive closure of used pointers.
- **`collect`** — Recursive walker over a JSON node; accumulates `$ref` strings under `#/components/`, security-scheme names (from `security` arrays), and operation tag names (from `tags` arrays). Skips `x-tagGroups`.
- **`collectSchemes`** — Extracts scheme names from a single `security` requirement array.
- **`pointerOf`** — Builds a `#/components/<kind>/<name>` pointer string.
- **`Findings`** — Interface holding the three collected `Set`s (`refs`, `schemes`, `tags`).
- **`ComponentMap`**, **`COMPONENT_PREFIX`** — Type alias and the `#/components/` prefix constant.

## Relationships

- **`openapi-document.ts`** — Supplies the `OpenApiDocument` and `Step` types that `pruneUnused` implements/consumes.
- **`openapi-bundle.ts`** — Orchestrates the pipeline; `pruneUnused` is registered as the last step it runs.
- **`object-guards.ts`** — Provides `isPlainObject`, used throughout the walk to distinguish plain JSON objects from arrays and primitives.
- **`tests/unit/scripts/contracts/prune-unused.test.ts`** — Unit tests exercising reachability, tag pruning, and `x-tagGroups` filtering.

## Notes

- **Ordering is critical.** This step must run *after* steps that inject new references (e.g. `ETag`, `IfMatchHeader`, `PreconditionFailed`, 413/415 responses). Running `redocly bundle --remove-unused-components` in their place would delete components those later steps still need.
- **Security schemes are tracked by name, not by `$ref`.** A scheme is kept if any `security` requirement array names it; a plain `#/components/securitySchemes/<name>` ref is not sufficient on its own.
- **`x-tagGroups` is intentionally excluded from tag collection.** A family *lists* its tags without "using" them in the OpenAPI sense; counting it would keep every tag alive. After pruning, groups whose tags all vanish are removed from `x-tagGroups` as well.
- The component reachability walk is **iterative** (explicit queue) rather than recursive, to avoid stack overflow on deeply nested component graphs.
