---
source: tests/cross-cutting/module-descriptors.test.ts
sha256: f1cc549d03e08543d7f177b2974ea1183f8f1ba5613417883557105133ff3d45
generated_at: 2026-11-14T23:04:47.391869+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-descriptors.test.ts

## Purpose

Cross-cutting test that verifies every `dependsOn` entry in each module's descriptor references a directory that actually exists on disk. It is the "dangling reference" guard for module descriptors; other hygiene checks (presence, schema strictness) are handled by the `module-graph` step of `npm run check`.

## Key elements

- **`moduleNames`** — Derived from `readdirSync(MODULES_ROOT)`, filtered to directory entries and sorted alphabetically. This is the source-of-truth list of real modules (read from the filesystem, not from any registry).
- **`describe.each(moduleNames)`** — Parametrises one suite per module folder.
- **`'names only real modules'`** — Reads the descriptor via `readModuleDescriptor`, then asserts every entry in `dependsOn` is present in `moduleNames`.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Supplies `readModuleDescriptor`, the shared descriptor parser used by both the docs tooling and this test.
- **`tests/support/paths.ts`** — Supplies the `MODULES_ROOT` constant (imported as `@tests/paths`) so the test resolves the modules directory the same way the rest of the codebase does.

## Notes

- The test deliberately reads module names from disk rather than from a registry/enablement list, so a descriptor is validated even when the module is disabled.
- Only `dependsOn` is checked here; the file does **not** assert that the descriptor exists or that its shape is valid — those concerns are owned by the `npm run check` module-graph step (as stated in the header comment).
- Uses `Array.prototype.toSorted` (non-mutating), available in Node ≥ 20.
