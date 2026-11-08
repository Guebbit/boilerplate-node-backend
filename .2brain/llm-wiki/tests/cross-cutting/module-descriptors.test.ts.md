---
source: tests/cross-cutting/module-descriptors.test.ts
sha256: f38440e7cd55d72b342d8eb2f9de83b15f7c7749f00aa7bc5b704e4e0cc04db3
generated_at: 2026-11-08T09:28:11.815829+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-descriptors.test.ts

## Purpose

Validates that every module's `module.yaml` descriptor is well-formed: it exists, parses against the strict schema, references only real sibling modules, contains no self-reference, and has no duplicate entries. This is the "catch the sloppy descriptor" half of the rule that `.dependency-cruiser.cjs` enforces at build time.

## Key elements

- **`moduleNames`** — derived from `readdirSync(MODULES_ROOT)`; lists every subdirectory (i.e. every module folder) on disk, sorted. Sourced from the filesystem, not a registry, so a module is checked even if it is disabled.
- **`describe.each(moduleNames)('%s/module.yaml', …)`** — one test suite per module folder containing three assertions:
  - *exists* — the `module.yaml` file is present.
  - *parses against the strict schema* — `readModuleDescriptor` does not throw.
  - *names only real modules, never itself, with no duplicates* — every entry in `dependsOn` is a member of `moduleNames`, the module's own name is absent, and no entry appears twice.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — provides `readModuleDescriptor`, the function under test. The test exercises its validation logic (schema parsing and `dependsOn` extraction) against every real descriptor in the repo.
- **`tests/support/paths.ts`** — supplies the `MODULES_ROOT` constant (imported via the `@tests/paths` alias) that anchors all filesystem lookups.

## Notes

- Module discovery is disk-based (`readdirSync` + `withFileTypes`), so adding a new folder under `MODULES_ROOT` immediately makes its descriptor a test subject without updating any registry.
- The file deliberately complements `.dependency-cruiser.cjs` rather than duplicating it: that config *fails closed* on a bad descriptor at build time; this test *flags the descriptor itself* in CI so the author fixes the source.
- Uses `.toSorted()` (non-mutating, ES2023) rather than `.sort()` — the array is not reassigned afterward.
