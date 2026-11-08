---
source: src/modules/account/session-mode.ts
sha256: 075d77cd93ba9557f638b47c750c7152339597b46290e93f456cc6d127c8a04d
generated_at: 2026-11-08T04:25:42.448625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session-mode.ts

## Purpose

A single-leaf module that defines the two session modes a deployment can use (`jwt` and `cookie`). It exists as a shared constant so that the schema, the runtime configuration, and the session strategies can all reference the mode names **without importing each other**, avoiding circular dependencies across the account/session feature.

## Key elements

- **`SESSION_MODES`** — `readonly ['jwt', 'cookie']` const array; the canonical list of valid modes.
- **`SessionMode`** — `type` alias: `'jwt' | 'cookie'`, derived from `SESSION_MODES`. Use this in function signatures and row shapes rather than repeating the literal union.

Mode semantics (per the module doc):

| Mode | Behaviour |
|------|-----------|
| `jwt` *(default)* | Short-lived access token + rotating refresh token. |
| `cookie` | One random session id, stored **hashed**, delivered via an `HttpOnly` cookie or a `ses_…` bearer value. |

## Relationships

- **`src/modules/account/model.ts`** — the row's `mode` column is typed with `SessionMode`.
- **`src/modules/account/session/config.ts`** — resolves the `NODE_SESSION_MODE` environment variable against `SESSION_MODES`.
- **`src/modules/account/session/strategy.ts`** — branches on the active `SessionMode` to pick the appropriate authentication strategy.
- **`src/modules/account/repository.ts`**, **`…/family-liveness.ts`**, **`…/listing.ts`** — sit in the same dependency subgraph and transitively depend on the mode type for filtering or validation.

## Notes

- This file is intentionally dependency-free (no imports). Treat it as a leaf: never add logic or imports here, or you'll re-introduce the circular-dependency problem it was created to prevent.
- The design rationale and deeper discussion live in `docs/theory/sessions.md`.
- `SESSION_MODES` is an `as const` tuple; use `SessionMode` for type positions and `SESSION_MODES` for runtime iteration or validation checks.
