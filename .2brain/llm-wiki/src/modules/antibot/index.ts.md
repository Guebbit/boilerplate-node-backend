---
source: src/modules/antibot/index.ts
sha256: 1b77a5a5bd52542c4a1cb7042bde959793b0fe6cb0c0f91db0ee09dfadd70ea8
generated_at: 2026-11-08T05:00:12.283396+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/index.ts

## Purpose

Public barrel (re-export) for the **antibot** module. It is the *only* surface a sibling module is permitted to import from (per the DDD rule in `docs/theory/stragnostic-ddd.md` §5). It exposes solely the service that the `GET /config` route composes; all internal wiring (`module.ts`, `routes.ts`, `controllers/`) stays private to the module.

## Key elements

- **`export * from './service'`** — Re-exports every public symbol from `src/modules/antibot/service.ts`. This is the file's entire runtime logic.
- **JSDoc contract** — Documents the import rule: sibling modules import *only* through this barrel; the cross-cutting gate (`humanChallengeGate`) is deliberately *not* re-exported here.

## Relationships

- **`src/modules/antibot/service.ts`** — The sole re-export source. All symbols consumed by callers come from this file.
- **`src/app/config-routes.ts`** — The primary consumer; its `GET /config` handler composes the antibot service imported via this barrel.

## Notes

- **Do not add re-exports casually.** The file's JSDoc explicitly forbids publishing wiring internals or the middleware gate. If `account` or `tasks` need `humanChallengeGate`, they import it directly from `infrastructure/http/middlewares/human-challenge` and `infrastructure/adapters/antibot`—not through this barrel.
- **Single-line implementation.** Despite the long doc comment, the executable surface is exactly one `export *` statement. Any behavioral change lives in `service.ts`, not here.
