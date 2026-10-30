---
source: scripts/contracts/fragments.ts
sha256: b5c99f1fd4f4b7e07900f713a473a73e7d4667731869a42e32598d8a5f971a4d
generated_at: 2026-10-29T01:30:33.639156+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/fragments.ts

## Purpose

Provides the single typed read path for module contract fragment files (`openapi.yaml` and `authorization.yaml`). Build steps call these readers instead of each declaring their own throwaway type for the subset of keys they inspect.

## Key elements

- **`DeclaredTag`** — shape of one entry under a fragment's top-level `tags:`.
- **`DeclaredSection`** — one export section a module declares for `POST /account/export` (`required`, `schema`).
- **`OpenApiFragment`** — the `openapi.yaml` subset the build cares about (`tags`, `paths`, `components.schemas`, `x-error-codes`, `x-personal-data`); every key optional because a fragment may declare any subset.
- **`AuthorizationRule`** — one rule entry from `authorization.yaml` (`action`, `subject`, `module`).
- **`AuthorizationSet`** — one permission set from `authorization.yaml` (`name`, `module`, `rules`).
- **`AuthorizationFragment`** — the parsed `authorization.yaml` shape (`rules`, `sets`).
- **`readOpenApiFragment(file)`** — reads and parses a single `openapi.yaml` file; an empty file yields `{}`.
- **`readModuleFragment(modulesRoot, module)`** — convenience wrapper that joins the path to `<modulesRoot>/<module>/openapi.yaml` and delegates to `readOpenApiFragment`.
- **`readAuthorizationFragment(file)`** — reads an `authorization.yaml`; returns `{ rules: [], sets: [] }` when the file is absent or a key is missing.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — consumes `OpenApiFragment`, `DeclaredTag`, and `readModuleFragment` to collect per-module OpenAPI fragments into a bundle.
- **`scripts/contracts/authorization-bundle.ts`** — consumes `AuthorizationFragment`, `AuthorizationRule`, `AuthorizationSet`, and `readAuthorizationFragment` to assemble the authorization bundle.
- **`scripts/contracts/personal-data-assembly.ts`** — reads `x-personal-data` sections (`DeclaredSection`) from `OpenApiFragment` to build the personal-data export manifest.
- **`scripts/contracts/root-assembly.ts`** — uses fragment types to compose the root contract from per-module fragments.
- **`scripts/scaffold/apply.ts`** — writes scaffolded fragment files that conform to these interfaces.
- **`scripts/scaffold/demo-remove-authorization.ts`** — demo that removes authorization entries, operating against the `AuthorizationFragment` shape.

## Notes

- **No caching by design.** Both readers hit the filesystem every call. The module doc comment states the reason explicitly: tests feed scratch trees, and a module-keyed cache would return the wrong module's data.
- **`readAuthorizationFragment` tolerates a missing file** (returns empty arrays), whereas `readOpenApiFragment` will throw if the path does not exist — callers must ensure the file is present before calling it.
- YAML parsing uses the `yaml` package's YAML 1.2 loader; the `as` casts narrow the loader's `any` return. An empty YAML file parses to `null`, which `readOpenApiFragment` coalesces to `{}`.
- The `paths` key in `OpenApiFragment` is typed shallowly (only `tags` per operation) — the build steps only need that field, so the type intentionally does not model the full OpenAPI operation object.
