---
source: tests/cross-cutting/module-descriptors.test.ts
sha256: d5d4d2c780fa6c519536d25b05d51799d068e81e242dc9a7108b0a0966709873
generated_at: 2026-09-27T15:50:58.898624+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-descriptors.test.ts

## Purpose

Validates that every module's `module.yaml` is well-formed and self-consistent. It is the hygiene counterpart to `.dependency-cruiser.cjs` (which enforces dependency *rules*): here the goal is to catch a sloppy descriptor itself—missing file, schema violation, self-reference, phantom sibling, duplicate entry, or unsorted edge list—before any other tooling trusts it.

## Key elements

- **`moduleNames`** — Derived from `readdirSync(MODULES_ROOT)`, listing all module *directories* on disk (not the registry), sorted alphabetically. Drives a `describe.each` block so every module gets the same three assertions.
- **Test: `exists`** — Asserts `module.yaml` is present in the module folder.
- **Test: `parses against the strict schema`** — Calls `readModuleDescriptor(descriptorPath)` and asserts it does not throw (i.e., the YAML conforms to the schema enforced by that reader).
- **Test: `names only real modules, never itself, with no duplicates, alphabetically`** — Extracts `dependsOn` and checks four invariants in one: no self-reference, every listed sibling appears in `moduleNames`, no duplicate entries, and the array is in sorted order (`.toSorted()` comparison).

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Provides `readModuleDescriptor`, the strict YAML-to-object parser used by two of the three tests. If the schema changes there, this test's "parses" assertion is the canary.
- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT` (via the `@tests/paths` alias), the filesystem root under which module directories and their `module.yaml` files are expected.

## Notes

- The module list is read **from disk, not from a registry or config**. A descriptor is therefore required even for a module that is currently disabled or unregistered elsewhere.
- The alphabetical check uses `.toSorted()` (non-mutating, ES2023) against the original array, so a correctly ordered `dependsOn` passes while any out-of-order entry fails—order is a hard invariant, not a stylistic suggestion.
- The file positions itself explicitly against `.dependency-cruiser.cjs`: that file is the *fail-closed enforcer*, this file is the *upstream quality gate*. They are complementary, not redundant.
