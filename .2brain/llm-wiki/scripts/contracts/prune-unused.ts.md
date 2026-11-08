---
source: scripts/contracts/prune-unused.ts
sha256: ece0377c9374c43974af7c7137d07e3f8b01ccc3a0caf67258280566aa656ca9
generated_at: 2026-11-08T02:44:10.512671+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/prune-unused.ts

## Purpose
Final pipeline step that removes every OpenAPI component (schema, response, parameter, security scheme, etc.) and every tag that nothing in the live document references. Without it, a deleted module leaves orphaned shared components in the published contract. It is deliberately the **last** step because earlier steps inject references (ETag, If-Match, 413/415 responses) that an earlier prune would wrongly delete.

## Key elements
- **`pruneUnused`** (exported) — The `Step` function. Builds a `Findings` set of reachable refs, security-scheme names, and tag names, then deletes any component not in that set, filters `document.tags`, and prunes emptied `x-tagGroups`.
- **`collect`** — Recursive walker over an arbitrary JSON subtree. Records `$ref` strings starting with `#/components/`, collects security-scheme names from `security` arrays, and gathers tag names from `tags` arrays. Explicitly skips `x-tagGroups` so it does not keep tags alive.
- **`collectSchemes`** — Extracts the scheme names (object keys) from a `security` requirement array into `Findings.schemes`.
- **`reachable`** — Seeds `collect` on the non-`components` portion of the document, then performs a worklist (queue) traversal through `components`, following newly discovered refs until the set stabilises.
- **`pointerOf(kind, name)`** — Builds the canonical `#/components/<kind>/<name>` pointer used for set membership checks.
- **`Findings`** — Interface holding three `Set`s: `refs`, `schemes`, `tags`.
- **`COMPONENT_PREFIX`** — Constant `#/components/` used to detect in-document component references.
- **`isObject`** — Type guard narrowing `unknown` to `Record<string, unknown>`.

## Relationships
- **`openapi-document.ts`** — Supplies the `OpenApiDocument` and `Step` types that `pruneUnused` implements; the function mutates the document in place.
- **`openapi-bundle.ts`** — Orchestrates the bundle pipeline and invokes `pruneUnused` as the terminal step.
- **`tests/unit/scripts/contracts/prune-unused.test.ts`** — Unit tests exercising pruning of components, security schemes, tags, and `x-tagGroups`.

## Notes
- **Ordering is load-bearing.** `redocly bundle --remove-unused-components` (or any equivalent) must not be used *before* the steps that add `ETag`, `IfMatchHeader`, `PreconditionFailed`, and the 413/415 responses; those steps need the components that an early prune would delete.
- Security schemes are reached by **name** (via `security` arrays), not by `$ref`. The pruning check for `securitySchemes` therefore looks up `found.schemes` rather than `found.refs`.
- `x-tagGroups` is intentionally invisible to the tag walker; otherwise every tag listed in a group would be considered "used" and survive pruning.
- A tag group whose `tags` array becomes empty after filtering is removed entirely (a docs renderer would otherwise show an empty section).
- The reachability traversal uses an iterative worklist (`queue.pop()` loop), not recursion, to avoid stack-depth issues with long reference chains.
