---
source: src/modules/observability/index.ts
generated_at: 2026-11-22T06:01:36.404920+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/index.ts

## Purpose
Public barrel for the observability module. It is documented as the only surface sibling modules may import, and it publishes the module's readiness/telemetry services by re-exporting them.

## Key elements
- `export * from './services'` — re-exports everything the services layer exposes. The file defines no logic of its own.

## Relationships
- `src/modules/observability/services/index.ts` — the sole source of this barrel's exports. Whatever that file exports becomes the module's public API.

## Notes
- Per the file's comment, nothing outside the module imports these services today. The barrel is where a future caller should import from, rather than deep-importing into the module.
- Because of the wildcard re-export, adding an export to `services/index.ts` also makes it public.
