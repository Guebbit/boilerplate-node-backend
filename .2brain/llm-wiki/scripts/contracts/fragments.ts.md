---
source: scripts/contracts/fragments.ts
sha256: 43d14168c77ec65daccb9aad3b56a53dd2242dc645c21383082e5a3380e04ae9
generated_at: 2026-10-15T09:37:24.849622+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/fragments.ts

## Purpose

Single read-only access point for the build steps to load a module's on-disk contract files (`openapi.yaml` and `authorization.yaml`). Exists so that every build step shares one typed shape for those files instead of each redeclaring a partial interface.

## Key elements

- **`OpenApiFragment`** — interface describing the subset of `openapi.yaml` the build steps care about (`tags`, `paths`, `components.schemas`, `x-error-codes`, `x-personal-data`). All fields optional.
- **`AuthorizationFragment` / `AuthorizationKey`** — minimal shape of `authorization.yaml` (an array of `{key, subject, module}`).
- **`DeclaredTag`**, **`DeclaredSection`** — per-entry types used inside the fragment interfaces.
- **`readOpenApiFragment(file)`** — reads and YAML-parses a single file into `OpenApiFragment`; an empty file yields `{}`.
- **`readModuleFragment(modulesRoot, module)`** — convenience wrapper that joins `modulesRoot/module/openapi.yaml` and delegates to `readOpenApiFragment`.
- **`readAuthorizationFragment(file)`** — reads and parses an `authorization.yaml`; returns `{ keys: [] }` if the file does not exist.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — calls `readModuleFragment` to collect per-module OpenAPI fragments before merging them into the bundled spec.
- **`scripts/contracts/authorization-bundle.ts`** — calls `readAuthorizationFragment` to gather `AuthorizationKey` entries across modules.
- **`scripts/contracts/personal-data-assembly.ts`** — reads `OpenApiFragment['x-personal-data']` to assemble the personal-data export contract.
- **`scripts/contracts/root-assembly.ts`** — consumes the combined outputs of the above bundles, ultimately sourced through this file's readers.
- **`scripts/scaffold/apply.ts`** — reads fragments (via `readModuleFragment` / `readAuthorizationFragment`) to validate or transform a newly scaffolded module's contract files.
- **`scripts/scaffold/demo-remove-authorization.ts`** — reads an `AuthorizationFragment` to locate and remove a demo authorization key.

## Notes

- **No caching by design.** Every call hits `fs.readFileSync`. The module doc comment explicitly states that a module-keyed cache would "answer for the wrong one" when tests supply scratch trees under the same module name.
- **Empty-file tolerance.** `readOpenApiFragment` treats a zero-byte (or whitespace-only) YAML file as `{}`; `readAuthorizationFragment` treats a *missing* file as `{ keys: [] }`. Callers need not check existence before calling.
- **Partial types.** The interfaces intentionally cover only the keys the build pipeline reads. A fragment file may contain many more OpenAPI fields; those are simply ignored by the type.
