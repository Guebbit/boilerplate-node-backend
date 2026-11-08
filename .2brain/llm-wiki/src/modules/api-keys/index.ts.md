---
source: src/modules/api-keys/index.ts
sha256: cc037a89a3d135d4cf7f4ee681e55b79b7a5647c718778cec7f65789214fa997
generated_at: 2026-11-08T05:02:32.236431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/index.ts

## Purpose

Public barrel (module facade) for the `api-keys` module. It is the **only** import surface a sibling module is allowed to use, enforcing the strategic DDD rule that internal files stay hidden (see `docs/theory/strategic-ddd.md` §5). It simply re-exports the public API of the three sibling files listed below.

## Key elements

- `export * from './services'` — re-exports all public symbols from `src/modules/api-keys/services/index.ts`.
- `export * from './emails'` — re-exports all public symbols from `src/modules/api-keys/emails.ts`.
- `export type * from './model'` — **type-only** re-export of `src/modules/api-keys/model.ts`; no runtime values are surfaced from the model layer.

## Relationships

- **`src/modules/api-keys/services/index.ts`** — re-exported wholesale; consumers of this barrel get the services API directly.
- **`src/modules/api-keys/emails.ts`** — re-exported wholesale; email-related helpers are part of the public surface.
- **`src/modules/api-keys/model.ts`** — re-exported as types only, so callers can reference model types in signatures without importing the module at runtime.

## Notes

- `credentials.ts` and `module.ts` are **deliberately not exported** here. The docstring states that minting/verifying a credential is an internal resource of this module, and `module.ts` wires the `CredentialResolver` at import time (side-effect) rather than as a public export.
- Because the model re-export uses `export type *`, tree-shaking will not pull model *values* into a consumer's bundle—only their type declarations.
