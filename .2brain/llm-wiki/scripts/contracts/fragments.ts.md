---
source: scripts/contracts/fragments.ts
sha256: 90671b4d77e8270b562a0e0947a36707b1aeec9074746a0cccdbbe1fbb85963d
generated_at: 2026-11-08T02:41:03.642920+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/fragments.ts

## Purpose

Typed, cache-free disk readers for the two per-module contract files (`openapi.yaml` and `authorization.yaml`). It exists so every build step shares one set of interfaces and load functions instead of each declaring its own throwaway shape for the few keys it inspects.

## Key elements

- **`DeclaredTag`** — one entry under a fragment's top-level `tags:` (name, optional description, optional `x-family`).
- **`TAG_FAMILY_OF_GROUP`** — read-only map from a module's `group` value (`foundation`, `shop`, `example`) to the API-docs family name used as the default tag group.
- **`DeclaredSection`** — shape of one `x-personal-data` export section (optional `required`, optional `schema`).
- **`OpenApiFragment`** — the subset of `openapi.yaml` the build steps read: `tags`, `paths` (with per-operation `tags` and `x-cache`), `components.schemas`, `x-error-codes`, `x-personal-data`. All keys optional.
- **`readOpenApiFragment(file)`** — parses a single YAML file into `OpenApiFragment`; empty file → `{}`.
- **`readModuleFragment(modulesRoot, module)`** — convenience wrapper that resolves `<modulesRoot>/<module>/openapi.yaml` and delegates to `readOpenApiFragment`.
- **`AuthorizationRule` / `AuthorizationSet` / `AuthorizationFragment`** — the fields of `authorization.yaml` the build steps read (`action`/`subject`/`module` per rule; `name`/`module`/`rules` per set).
- **`readAuthorizationFragment(file)`** — parses an `authorization.yaml`; missing file → `{ rules: [], sets: [] }`; absent keys default to empty arrays.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — consumes `OpenApiFragment` / `DeclaredTag` to merge multiple module fragments into a single OpenAPI bundle.
- **`scripts/contracts/authorization-bundle.ts`** — consumes `AuthorizationFragment` to assemble the combined authorization model.
- **`scripts/contracts/personal-data-assembly.ts`** — reads `x-personal-data` sections (`DeclaredSection`) from fragments.
- **`scripts/contracts/root-assembly.ts`** — orchestrates reading fragments across all modules before bundling.
- **`scripts/contracts/openapi-extensions.ts`** — interprets extension keys (`x-error-codes`, `x-tagGroups`) that appear in `OpenApiFragment`.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — sibling fragment reader for AsyncAPI files; shares the same "read-only subset" philosophy.
- **`scripts/contracts/analytics-browser-events.ts`** — consumes fragment `paths` tags to correlate analytics events with API operations.
- **`scripts/scaffold/apply.ts`** — writes new module fragments; `TAG_FAMILY_OF_GROUP` supplies the default `x-family` it stamps onto generated tags.
- **`scripts/scaffold/templates-contract.ts`** / **`demo-remove-authorization.ts`** — scaffold helpers that produce or modify the `authorization.yaml` shapes defined here.
- **`tests/cross-cutting/cache-policy-declared.test.ts`** — exercises `x-cache` values surfaced through `OpenApiFragment.paths`.

## Notes

- **No caching by design.** The module deliberately reads from disk on every call so that tests can point at scratch directory trees. A module-keyed cache would return stale data when the test swaps the file.
- **Intentionally narrow shapes.** `OpenApiFragment` and `AuthorizationFragment` capture only the fields build steps actually read; they are *not* full OpenAPI / authorization schemas. Do not expect `info`, `servers`, or other top-level keys.
- **Empty-file semantics differ.** `readOpenApiFragment` treats an empty YAML file as `{}` (valid, declares nothing). `readAuthorizationFragment` treats a *missing* file as `{ rules: [], sets: [] }`, and defaults absent top-level keys to empty arrays.
- **`TAG_FAMILY_OF_GROUP` is a `Readonly` constant map**, not a function. Adding a new module group requires adding an entry here *and* in `module.yaml`.
