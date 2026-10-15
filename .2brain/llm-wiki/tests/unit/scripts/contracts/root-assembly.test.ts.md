---
source: tests/unit/scripts/contracts/root-assembly.test.ts
sha256: 35a74a9b4058310a2e9b3d9dfbb53a9e2da43170c9b3f56ab78a475e50891c61
generated_at: 2026-10-15T13:26:42.692189+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/root-assembly.test.ts

## Purpose

Unit tests for the `assembleRoot` and `pathRefFor` helpers in `scripts/contracts/root-assembly.ts`. Verifies that merging module fragments into a root OpenAPI YAML document preserves existing content (paths, tags, comments, order), correctly adds or removes `$ref` entries, and handles edge cases like missing `paths` maps and JSON-pointer escaping.

## Key elements

- **`ROOT`** — a realistic OpenAPI 3.1 root string (system path, comment separators, `$ref` entries, a tag with description) used as the test fixture.
- **`alpha`, `widgets`** — sample `ModuleFragment` objects representing module sections with their paths and tag lists.
- **`assembled(fragments)`** — helper that runs `assembleRoot(ROOT, fragments)` and parses the result with `yaml`, returning a typed object for assertions.
- **`describe('assembleRoot')`** block covering:
  - Idempotency: a root already consistent with its fragments is returned unchanged.
  - Appending: new module paths and tags are added after existing ones.
  - Removal: refs for a module absent from the fragment list are dropped.
  - Preservation: root-declared paths, tag descriptions, path order, and comments survive the merge.
  - JSON-pointer escaping via `pathRefFor` (`/` → `~1`, `~` → `~0`).
  - Error: throws when the root has no `paths` map.
  - `declaredTags`: a tag with a description from the fragment is emitted with that description; a tag only in `tags` (not `declaredTags`) is emitted bare; a tag only in `declaredTags` appears even with zero paths.

## Relationships

- **`scripts/contracts/root-assembly.ts`** — sole production dependency. The test imports `assembleRoot` (the merge function), `pathRefFor` (the `$ref` string builder), and the `ModuleFragment` type.

## Notes

- Assertions on the `paths` object rely on **insertion order** of keys (guaranteed for string keys in JS), so the "keeps root order" test is sensitive to object key enumeration order rather than an explicit order field.
- The idempotency test manually strips the `/gone` section from `ROOT` with a regex; it does not exercise the "module is gone" path through `assembleRoot`'s normal fragment-matching logic.
- `pathRefFor` escaping follows RFC 6901 JSON Pointer: `~` is escaped first (`~0`), then `/` (`~1`). The test asserts `~1x~0y~1{id}` for input `/x~y/{id}`.
