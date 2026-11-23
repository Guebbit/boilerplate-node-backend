---
source: scripts/contracts/prune-unused.ts
source_sha256: d31e0d20f437a79fa0a9d3b04c46fe9716d153a82a970a5c6581e379a8fb6b43
context_sha256: 9b73929727e3a96facdc5a95b3d80be3f0ad5d726855d25566642d4745ac1921
generated_at: 2026-11-22T01:59:38.707877+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/prune-unused.ts

## Purpose
The last step applied to the bundled OpenAPI document. It removes every component that nothing reaches and every tag no operation uses, so the published contract doesn't keep describing parts of the deployment that were deleted (for example, a security scheme or response that only a removed module's routes used).

## Key elements
- `pruneUnused` (exported, typed as `Step`): mutates the document in place. It finds what is reachable, deletes unreferenced entries from each `components` section, filters `document.tags` to the used ones, and trims `x-tagGroups`. Groups left with no tags are dropped.
- `reachable(document, found)`: walks everything outside `components` and records the `$ref` pointers it finds. It then follows those pointers into the components they reach, using a work queue, until no new pointers appear.
- `collect(node, found, key)`: generic JSON walk. It records:
  - `$ref` strings that start with `#/components/`.
  - Scheme names from `security` arrays (via `collectSchemes`).
  - Tag names from `tags` arrays of strings.
- `collectSchemes`: adds the keys of each `security` requirement object to `found.schemes`.
- `pointerOf(kind, name)`: builds `#/components/<kind>/<name>`.
- `Findings`: the accumulator, holding `refs`, `schemes` and `tags` as sets.
- `COMPONENT_PREFIX`: `#/components/`.

## Relationships
- `./openapi-document`: supplies the `OpenApiDocument` and `Step` types. `pruneUnused` is a `Step` in the bundling pipeline.
- `src/infrastructure/object-guards`: provides `isPlainObject`, used to guard every walk.
- `./openapi-bundle`: a graph neighbor. This file does not import it, and the header comment only says this step runs last.
- `tests/unit/scripts/contracts/prune-unused.test.ts`: unit tests for this step.

## Notes
- Ordering matters. The step must run last: `redocly bundle --remove-unused-components` is too early, because earlier steps add references (`ETag`, `IfMatchHeader`, `PreconditionFailed`, the 413 and 415 responses) that an early prune would delete.
- Security schemes are kept by name, through `security` requirements. They are not kept by `$ref`.
- `x-tagGroups` is skipped during the walk, so listing a tag there doesn't keep it alive. Its group tag lists are then filtered to the surviving tags.
- Only in-document `#/components/...` refs are tracked.
- The `components` cast to `ComponentMap` is a narrowing, not a conversion.
- Deletion uses `Reflect.deleteProperty` on the existing component maps.
