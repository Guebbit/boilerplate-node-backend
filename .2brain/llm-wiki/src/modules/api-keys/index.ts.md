---
source: src/modules/api-keys/index.ts
sha256: a0d776c2cc1daf4b45dfe05fb465948b2cc0e11e15f58a2d688c1ed304cc4dee
generated_at: 2026-09-23T18:24:08.009031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/index.ts

## Purpose

Barrel (public surface) for the `api-keys` module. Sibling modules are only permitted to import from this file, enforcing the module boundary defined in `docs/theory/strategic-ddd.md` §5. It re-exports the service API and the type definitions so consumers never reach into the module's internals.

## Key elements

- `export * from './services'` — re-exports all runtime values (functions, classes) from the services barrel.
- `export type * from './model'` — re-exports **types only** from the model, keeping type imports tree-shakeable and signalling that model code is not a runtime dependency of consumers.

## Relationships

- **`src/modules/api-keys/services/index.ts`** — sole runtime re-export target; all callable API of the module flows through this file.
- **`src/modules/api-keys/model.ts`** — sole type re-export target; provides the domain types exposed to the rest of the codebase.

## Notes

- `credentials.ts` is deliberately **not** re-exported. The doc comment states that minting/verifying a credential is an internal resource of the module; no other module has a business need for it.
- `module.ts` wires the `CredentialResolver` itself at import time — consumers do not instantiate or inject it; they receive it implicitly through the service exports.
- The `export type *` syntax (not `export *`) is intentional: it prevents accidental runtime imports of model code at the consumer side.
