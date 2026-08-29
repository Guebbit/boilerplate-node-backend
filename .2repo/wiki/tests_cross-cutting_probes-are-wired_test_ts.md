# tests/cross-cutting/probes-are-wired.test.ts

## Purpose

Guard test that asserts a one-directional completeness invariant: every `src/modules/<name>/probes.ts` that exists on disk is listed in `PROBED_SECTIONS` in the client-collections bundle script. This catches the silent failure mode where a new module writes a valid `probes.ts` but forgets to add its name to the hand-maintained map — a case the static import (which only catches *deletion*) cannot surface.

## Key elements

- **`MODULES_ROOT`** — Path to `src/modules`, resolved relative to this test file.
- **`modulesDeclaringProbes()`** — Scans `MODULES_ROOT` with `readdirSync` + `existsSync` and returns the names of subdirectories that contain a `probes.ts`.
- **`describe('every declared probes.ts reaches the collections')`** — Three tests:
  - *no module whose probes are missing from the map*: every discovered module name must appear in `PROBED_SECTIONS`.
  - *actually scans the module tree*: canary — the discovered list must be non-empty, preventing a vacuous pass from a broken path.
  - *maps no section that declares no probes*: reverse check — every entry in `PROBED_SECTIONS` must have a corresponding `probes.ts` on disk, catching stale map entries.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Static import of `PROBED_SECTIONS`, the `Partial<Record<…>>` map that lists which modules contribute probes to the generated collections. This test is the runtime complement to that file's compile-time import guard: the import catches *deleted* modules; this test catches *added-but-unlisted* and *stale* entries.
- **`docs/theory/module-lifecycle.md`** — Documents the lifecycle contract that adding a domain edits nothing outside its own folder; this test enforces the one exception (the probes map) and keeps that exception honest.
- **`docs/theory/modules.md`** — Describes the four probe siblings (`audit.ts`, `analytics.ts`, `events.ts`, `metrics.ts`) and why `probes.ts` is uniquely hand-wired rather than reached via a shared extension point.

## Notes

- The test deliberately does **not** flag modules that simply have no `probes.ts` — most read-only endpoints have no interesting rejections to probe.
- The canary test (`length > 0`) exists because an empty `readdirSync` result (e.g., wrong `__dirname` after a repo restructure) would make the main assertion pass vacuously.
- The static import of `PROBED_SECTIONS` in `client-collections-bundle.ts` is intentional and should not be removed; it provides a stronger failure (compile error) for deleted modules than any test can.
