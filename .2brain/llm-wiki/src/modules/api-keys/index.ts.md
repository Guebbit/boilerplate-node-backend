---
source: src/modules/api-keys/index.ts
sha256: cc037a89a3d135d4cf7f4ee681e55b79b7a5647c718778cec7f65789214fa997
generated_at: 2026-10-29T03:13:04.950819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/index.ts

## Purpose

Public barrel (entry point) for the `api-keys` module. It is the **only** surface a sibling module may import, enforcing the module-boundary rule described in `docs/theory/strategic-ddd.md` §5. It contains no logic—only re-exports.

## Key elements

- **`export * from './services'`** — Re-exports all public values (functions, classes, constants) from the services layer.
- **`export * from './emails'`** — Re-exports all public values related to api-key email templates/helpers.
- **`export type * from './model'`** — Re-exports **types only** from the domain model, preventing accidental runtime imports of model internals.

## Relationships

- **`src/modules/api-keys/services/index.ts`** — Its exports are the primary functional surface of this module (service methods, etc.).
- **`src/modules/api-keys/emails.ts`** — Exposed here so other modules can access email-related helpers without reaching into the module's internals.
- **`src/modules/api-keys/model.ts`** — Exposed here as a type-only surface, giving consumers the domain types they need without importing implementation.

## Notes

- `credentials.ts` (credential minting/verification) is **deliberately excluded** from this barrel. It is an internal resource of the module; no sibling module should call into it.
- `module.ts` wires the `CredentialResolver` at import time, but it is **not** re-exported here—consumers get it implicitly through the module's side-effect wiring, not through a named export.
- The use of `export type *` (vs. `export *`) for the model is intentional: it guarantees the model contributes zero runtime surface to consumers.
