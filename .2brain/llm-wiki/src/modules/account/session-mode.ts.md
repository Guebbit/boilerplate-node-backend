---
source: src/modules/account/session-mode.ts
source_sha256: a9c004e0194dda7ea02c1c1750b59e3a0cf5438b6c154e299315fc7bd543eaef
context_sha256: 1c29434e29d7dcc588a573d107a694dcb2e9a50c756e8975cbe3f3102f2fb8a6
generated_at: 2026-11-22T03:44:27.680325+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session-mode.ts

## Purpose
Defines the two ways a deployment can keep people signed in. It is a leaf module with no imports, so the schema (a row's `mode`), the configuration (`NODE_SESSION_MODE`) and the session strategies can all reference the mode names without importing each other.

## Key elements
- `SESSION_MODES` — a readonly tuple, `['jwt', 'cookie']`.
  - `jwt`: a short access token plus a rotating refresh token (the default).
  - `cookie`: one random session id, stored hashed, in an HttpOnly cookie or a `ses_…` bearer.
- `SessionMode` — the union type derived from `SESSION_MODES` (`'jwt' | 'cookie'`).

## Relationships
The file's own doc comment names three consumers: the schema, the configuration and the strategies. The neighbor list suggests likely matches, but the file content doesn't show any imports.
- Schema: a row's `mode` (likely `src/modules/account/model.ts` / `src/modules/account/repository.ts`).
- Configuration: `NODE_SESSION_MODE` (likely `src/modules/account/session/config.ts`).
- Strategies: likely `src/modules/account/session/strategy.ts`.

`src/modules/account/session/family-liveness.ts` and `src/modules/account/session/listing.ts` are also graph neighbors. Nothing in this file says how they use it.

## Notes
- Keep this file dependency-free. The leaf design is what lets the schema, configuration and strategies share these names without circular imports.
- Adding a mode means editing `SESSION_MODES`. `SessionMode` follows automatically because it is derived from the tuple.
