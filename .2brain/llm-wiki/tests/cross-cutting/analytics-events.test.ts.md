---
source: tests/cross-cutting/analytics-events.test.ts
sha256: ab4b18c1217da2b75dfff4ec5a85b12197e9af9f0e486518734afd5a363b2742
generated_at: 2026-09-27T15:48:46.455102+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/analytics-events.test.ts

## Purpose

A cross-cutting guard that sweeps every module's `analytics.ts` file to enforce invariants on the shared analytics vocabulary: no duplicate constant names, no duplicate event-string values (which would produce indistinguishable rows in Umami), correct lower-snake_case naming, and that each module actually augments the analytics port type. Because the frontend emits no custom events of its own, this sweep is the sole enforcement point for the entire analytics naming contract.

## Key elements

- **`ANALYTICS_PORT`** — the specifier (`@infrastructure/observability/analytics`) that modules must `declare module`-augment to add their names to the port's union.
- **`listAnalyticsFiles()`** — discovers every `src/modules/<name>/analytics.ts` by reading the modules directory (via `MODULES_ROOT`), filtering to files that exist. No static list is maintained.
- **`readEvents(file)`** — dynamically imports the file and locates the exported event map **by shape** (the object whose values are all strings), since the constant's name varies per module (`accountAnalyticsEvents`, `cartAnalyticsEvents`, …). A module that fails to load throws here rather than silently contributing nothing.
- **`describe('analytics event names across modules', …)`** — five `it` blocks:
  1. Every module that declares a file also declares at least one name (with canary assertions that the sweep actually found directories and files).
  2. No two modules export the same **key** (constant name).
  3. No two modules export the same **value** (event string) — the collision that reaches Umami.
  4. Every event string matches `^[a-z][\da-z]*(_[a-z][\da-z]*)+$` (lower snake_case, two+ segments, subject-first, past-tense verb closes).
  5. Every module's source contains a `declare module '@infrastructure/observability/analytics'` augmentation block.

## Relationships

- **`tests/support/paths.ts`** — imports `MODULES_ROOT`, the filesystem root under which `src/modules/<name>/` directories are resolved. All discovery in this file is relative to that path.

## Notes

- The port-augmentation check (test 5) reads **source text** via `readFileSync` rather than using a type-level assertion, because `declare module` augmentations are erased at runtime and a value-level check could only restate "a string is a string."
- `readEvents` finds the export by shape, not by name; if a module ever exports two all-string object constants the first one found is used (order depends on `Object.values` iteration).
- The canary in test 1 (`readdirSync(MODULES_ROOT).length > 0`) distinguishes "the sweep broke / directory missing" from "genuinely no module declares analytics."
- Related doc references: `docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one` and `docs/tools/analytics.md#naming`.
