---
source: tests/cross-cutting/probes-are-wired.test.ts
sha256: 8dd14cd83233eed67f4aa1d59f33d625c6b52a8af659920e9f6c513224e10676
generated_at: 2026-09-23T19:58:24.809534+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/probes-are-wired.test.ts

## Purpose

Cross-cutting guard that verifies every module shipping a `probes.ts` is registered in the `PROBED_SECTIONS` map, and vice-versa. The static import in the bundle file already catches _deletion_ (compile error); this test catches _omission_ — a new module that writes probes but never edits the map, which would silently drop its probes from the generated collections.

## Key elements

- **`MODULES_ROOT`** — Path to `src/modules`, resolved relative to `__dirname`.
- **`modulesDeclaringProbes()`** — Reads `src/modules/` and returns the names of subdirectories that contain a `probes.ts` file (discovery, not a hardcoded list).
- **Test: "finds no module whose probes are missing from the map"** — Forward check: every on-disk `probes.ts` must appear in `PROBED_SECTIONS`.
- **Test: "actually scans the module tree"** — Canary: asserts the directory scan returned at least one entry, so an empty glob can never masquerade as "all wired."
- **Test: "maps no section that declares no probes"** — Reverse check: every entry in `PROBED_SECTIONS` must correspond to a `probes.ts` on disk (catches stale map entries after a file is deleted but the import somehow survives).

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Imports `PROBED_SECTIONS` (a `Partial<Record<…>>` map of module name → probe section). This test is the only consumer that asserts the map's keys match the filesystem. The bundle's static `import { … } from '<module>/probes'` provides the complementary deletion guard.

## Notes

- A module _without_ a `probes.ts` is explicitly not a finding; most read endpoints have no interesting rejection paths to probe.
- The test is intentionally one-directional in intent (omission detection) even though it checks both directions on disk. The static import already makes the "deletion" direction a compile-time error; this test adds the "forgetting to add" direction that no compiler can catch.
- The canary test is a convention shared with the audit sweep: it prevents the suite from passing vacuously if `src/modules/` is ever missing or empty due to a path or CI-layout mistake.
