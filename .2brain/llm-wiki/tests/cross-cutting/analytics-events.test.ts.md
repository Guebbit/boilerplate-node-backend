---
source: tests/cross-cutting/analytics-events.test.ts
sha256: 58564d0394f9480aae4c19b8f0b743b5c0682de37131f02dd44774cede6ce64e
generated_at: 2026-11-08T09:22:49.887201+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/analytics-events.test.ts

## Purpose
Cross-cutting sweep that verifies analytics event names declared across all `src/modules/*/analytics.ts` files remain globally unique. Because every event is reported to a single Umami website keyed by name, a name claimed by two modules produces indistinguishable rows. The test guards both the constant *keys* and the event *string values* to catch both kinds of collision.

## Key elements
- **`listAnalyticsFiles()`** — Discovers every `analytics.ts` under `MODULES_ROOT` via `readdirSync` + `existsSync`, returning `{ module, file }` pairs. No hard-coded module list.
- **`readEvents(file)`** — Dynamically imports a module's `analytics.ts` and locates the exported events object *by shape* (a non-null object whose values are all strings), since the constant name varies per module (e.g. `accountAnalyticsEvents`, `cartAnalyticsEvents`).
- **`describe('analytics event names across modules')`** — Three assertions:
  - Every module that declares analytics exposes at least one event name (with a canary check that `MODULES_ROOT` is non-empty so an empty result isn't misread).
  - No two modules export the same constant *key*.
  - No two modules export the same event *string value* (the collision that actually reaches Umami).

## Relationships
- **`tests/support/paths.ts`** — Supplies the `MODULES_ROOT` constant (imported as `@tests/paths`), which defines the filesystem root under which the sweep searches for per-module `analytics.ts` files.

## Notes
- The file is the declared "twin" of `audit-actions.test.ts`; both are cross-cutting name-uniqueness sweeps.
- `readEvents` imports the target module at runtime. If a module's `analytics.ts` fails to load, the test fails rather than silently skipping that module.
- The events object is found structurally (all-string values), not by a fixed export name, so adding a module only requires an `analytics.ts` with a flat `Record<string, string>` export—no test-file edit needed.
- The canary assertion (`files.length >= 1`) protects against a broken `MODULES_ROOT` path silently passing all three checks with zero files scanned.
