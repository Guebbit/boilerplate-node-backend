---
source: scripts/contracts/prune-unused.ts
sha256: 583806152fb01f36f1f41f1342aa3a38b1e3f2a38f592db82180b3412624565d
generated_at: 2026-10-14T07:12:05.699821+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/prune-unused.ts

## Purpose

Removes every component in a bundled OpenAPI document that nothing reaches (via `$ref` or security requirements) and every tag no operation references. It exists as the **last** step in the contract pipeline so that orphaned components left behind by deleted modules—security schemes, responses, parameters—are stripped before the document is published, while preserving components that earlier pipeline steps have just added.

## Key elements

- **`pruneUnused(bundled: string): string`** — The sole export. Parses YAML, computes reachability, deletes unused components and tags, re-serializes and returns the YAML text. Throws if the input does not parse to a YAML object.
- **`collect(node, found, key?)`** — Recursive walker over any JSON subtree. Records `#/components/…` pointers, security-scheme names (when the parent key is `security`), and tag names (when the parent key is `tags`) into a `Findings` object.
- **`reachable(document, found)`** — Seeds `found` by walking everything *outside* `components`, then performs a worklist (queue) walk through component definitions, collecting new refs each pass until no new pointers appear. Makes reachability transitive.
- **`collectSchemes(requirements, found)`** — Extracts scheme names from a `security` array's requirement objects.
- **`Findings`** — Interface holding three `Set`s: `refs`, `schemes`, `tags`.
- **`BundledDocument`** — Minimal typed view of the OpenAPI document (optional `components` and `tags` keys).
- **`pointerOf(kind, name)`** — Builds the `#/components/<kind>/<name>` string for a component.
- **`isObject`** — Type guard narrowing `unknown` to a plain JSON object.
- **`COMPONENT_PREFIX`** — Constant `#/components/`; the prefix every in-document component pointer starts with.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — The pipeline orchestrator. `pruneUnused` is invoked as its final step, after all reference-adding transforms (ETag, IfMatchHeader, PreconditionFailed, 413/415 responses) have run. Calling it earlier would delete components those transforms are about to introduce.
- **`tests/unit/scripts/contracts/prune-unused.test.ts`** — Unit tests exercising `pruneUnused` and the internal reachability/tag logic.

## Notes

- **Ordering is load-bearing.** `redocly bundle --remove-unused-components` is *not* used here because it runs before the custom transforms that add new `$ref`s; this module deliberately runs after them.
- **Security schemes are tracked by name, not by `$ref`.** A scheme is kept when it appears as a key inside a `security` requirement object, which is a different lookup path than the `#/components/…` pointer check used for every other component kind.
- **`lineWidth: 0`** is passed to `stringifyYaml` to disable line folding, keeping output diffs small.
- The module uses the `yaml` package (YAML 1.2 dialect) for both parse and serialize.
- Reachability is fully transitive: a component referenced only by another component is kept as long as that intermediate component is itself reachable.
