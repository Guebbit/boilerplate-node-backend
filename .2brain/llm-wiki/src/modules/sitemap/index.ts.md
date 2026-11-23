---
source: src/modules/sitemap/index.ts
source_sha256: ec1f7a82e12214cf73b37efc90ac824cc5ac908a31863d3edcabc1dcc79980a7
context_sha256: 5706da137a1d0cf31f8f21023caa3971dfd858e763b8031a353b33d7c0e6c403
generated_at: 2026-11-22T07:48:46.566602+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/index.ts

## Purpose
Public barrel for the `sitemap` module. Its doc comment states it is the only surface a sibling module may import, so other modules access sitemap functionality through this file rather than reaching into internals.

## Key elements
- `export * from './service'` — the sole content; re-exports everything the service file exports as the module's public API.

## Relationships
- `src/modules/sitemap/service.ts` — the only source re-exported. Whatever `service.ts` exports becomes publicly available through this barrel.

## Notes
- Adding an export to `service.ts` automatically makes it public, since the re-export is a wildcard. Anything that should stay private should not be exported from `service.ts`.
- The doc comment points to further documentation on the "published language" barrel concept and on the module's neighbourhood.
