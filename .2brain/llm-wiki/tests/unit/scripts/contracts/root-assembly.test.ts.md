---
source: tests/unit/scripts/contracts/root-assembly.test.ts
sha256: 93f02dd242e62724468b34be56ca494818c3d3bda0573fc2e8d2134a8ea81e5f
generated_at: 2026-11-08T10:35:01.099995+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/root-assembly.test.ts

## Purpose

Unit tests for the `assembleRoot` and `pathRefFor` utilities that compose a root OpenAPI document from per-module fragments. The suite verifies that assembly is idempotent, that stale `$ref` entries are removed, that new paths/tags are appended in stable order, and that tag-family (`x-family`) grouping behaves as specified.

## Key elements

- **`ROOT`** – A YAML string fixture shaped like the real root OpenAPI document (system path, comment separators, module `$ref` entries, `tags`, `x-tagGroups`). Used as the starting document for every assertion.
- **`alpha` / `widgets`** – `ModuleFragment` literals serving as the primary and secondary module inputs.
- **`assembled(fragments)`** – Helper that calls `assembleRoot(ROOT, fragments)` and parses the result with the `yaml` package, returning a typed object.
- **`groupsOf(fragments)`** – Shorthand to extract `x-tagGroups` as `[name, tags[]]` pairs.
- **`describe('assembleRoot', …)`** – Main suite (12 tests) covering:
  - Idempotency (no-op when root already matches fragments)
  - Appending unknown paths/tags after existing ones
  - Dropping `$ref` lines for absent modules
  - Preserving root-declared paths, tag descriptions, path order, and comments
  - JSON-pointer escaping via `pathRefFor`
  - Throwing when the root has no `paths` map
  - Tag description from `declaredTags`; bare tags for used-only entries
  - Declared-only tags appearing even without operations
- **`describe('tag families', …)`** – Nested suite (3 tests) covering `x-family` assignment, fallback to the module's `group` name, and deduplication of a borrowed tag into a single family group.

## Relationships

- **`scripts/contracts/root-assembly.ts`** – The module under test. This file imports `assembleRoot`, `pathRefFor`, and the `ModuleFragment` type from it. All assertions exercise that module's public API.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** – A sibling contract test that exercises the same assembled-document contract from the perspective of a specific locale module. No direct import exists between the two; they share the `root-assembly` dependency as a common subject.

## Notes

- Tests parse the assembly output with the `yaml` library rather than comparing raw strings (except the idempotency and comment-preservation cases, which use `toBe`/`toContain` on the string form).
- The `pathRefFor` escaping test asserts JSON-pointer rules (`~` → `~0`, `/` → `~1`) explicitly; if the convention changes, that single test is the canary.
- The "borrowed tag" test (`borrower` + `owner`) asserts order-independence: the fragment that *declares* the tag (via `declaredTags`) owns the family assignment, regardless of array position.
