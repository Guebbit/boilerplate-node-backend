---
source: src/modules/account/session-mode.ts
sha256: 075d77cd93ba9557f638b47c750c7152339597b46290e93f456cc6d127c8a04d
generated_at: 2026-10-14T08:57:35.836727+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session-mode.ts

## Purpose

Defines the shared vocabulary for the two session strategies a deployment can use (`jwt` and `cookie`). It is a dependency-free leaf module so that the schema, configuration, and strategy code can all reference the same literals without importing each other.

## Key elements

- **`SESSION_MODES`** — `readonly ['jwt', 'cookie']`. The canonical list of valid modes; usable for validation, iteration, or exhaustiveness checks.
- **`SessionMode`** — `type` alias for `'jwt' | 'cookie'`, derived from `SESSION_MODES[number]`. The type to annotate fields, function params, and config values.

## Relationships

This file has **no imports**; it is a pure type/constant leaf. The listed neighbors are downstream consumers:

- **`session/config.ts`** — reads `NODE_SESSION_MODE` and validates it against `SESSION_MODES`; exports a value typed as `SessionMode`.
- **`session/strategy.ts`** — implements one strategy per member of `SessionMode`; likely branches or registers handlers keyed by the literal.
- **`model.ts`** — the session row's `mode` column is typed with `SessionMode`.
- **`repository.ts`** / **`listing.ts`** — pass or filter on `SessionMode` values.

## Notes

- The module doc references `docs/theory/sessions.md` for the design rationale; consult it before adding a third mode.
- Because the list is `as const`, adding a new entry requires updating every `switch`/`if` that is expected to be exhaustive over `SessionMode`.
- `jwt` is the default mode (per the inline comment); `cookie` stores a hashed random id in an HttpOnly cookie or a `ses_…` bearer token.
