---
source: tests/cross-cutting/probes-are-wired.test.ts
sha256: f748228232bc7e63ea25494859de32a27b0aa40ef396409162fcc357543a64ab
generated_at: 2026-09-27T15:51:42.731241+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/probes-are-wired.test.ts

## Purpose

Cross-cutting guard that ensures the `PROBED_SECTIONS` map (a hand-maintained `Partial<Record<…>>` in the client-collections bundle) stays in sync with the filesystem: every module that ships a `probes.ts` must appear in the map, and every entry in the map must correspond to a file on disk. It closes the gap the static import in the bundle cannot cover — a *new* module that writes a valid `probes.ts` but forgets to edit the map.

## Key elements

- **`modulesDeclaringProbes(): string[]`** — Scans `MODULES_ROOT` and returns directory names that contain a `probes.ts` file.
- **"finds no module whose probes are missing from the map"** — Asserts the set difference (on-disk modules ∖ `PROBED_SECTIONS`) is empty.
- **"actually scans the module tree"** — Canary: asserts the scan returned at least one entry, preventing a vacuous pass if `MODULES_ROOT` is misconfigured.
- **"maps no section that declares no probes"** — Reverse-direction check: no entry in `PROBED_SECTIONS` lacks a corresponding `probes.ts` on disk (catches stale entries after deletion).

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Source of the `PROBED_SECTIONS` constant that this test validates. The bundle's static imports provide compile-time safety for *deleted* modules; this test covers the *newly added* direction.
- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem root that `modulesDeclaringProbes()` scans.

## Notes

- A module *without* a `probes.ts` is not a finding — the test does not require every module to declare probes.
- The canary test (`length > 0`) is the same pattern used in the audit sweep: an empty scan must mean "all wired," never "nothing was read."
- The reverse test (map entry with no file) is defensive; the static import in the bundle would already fail the build if a file were deleted, but a *manually removed* map entry with no import would not.
