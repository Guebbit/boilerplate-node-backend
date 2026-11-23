---
source: scripts/contracts/fragments.ts
source_sha256: f846c0ef74c2c16abca50f3e937ae2bdc4256905d1c9488cc73c08583e4b232f
context_sha256: 018f325fb30e1d96649e6e69bb8c4759ba376322f3209b9e67e23e3f33fd1cd4
generated_at: 2026-11-22T01:55:55.234836+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/fragments.ts

## Purpose
Single place where build steps read a module's contract fragments (`openapi.yaml` and `authorization.yaml`) from disk, so each step doesn't declare its own throwaway type for the few keys it uses. Readers take a root directory or a file path, never a cache, so tests can feed scratch trees.

## Key elements
- `DeclaredTag` — one entry of a fragment's top-level `tags:` (`name`, optional `description`, optional `x-family`).
- `TAG_FAMILY_OF_GROUP` — maps a module `group` from `module.yaml` (`foundation`→`Core`, `shop`→`Shop`, `example`→`Example`) to the API-docs family used when a tag names none. The scaffolder also writes it into a new module's own tags.
- `DeclaredSection` — an export section for `POST /account/export` (`required`, `schema`).
- `OpenApiFragment` — a module's `openapi.yaml` as the build sees it. Every key is optional: `tags`, `paths` (reduced to each operation's `tags` and `x-cache`), `components.schemas`, `x-error-codes`, `x-personal-data`.
- `readOpenApiFragment(file)` — parses one OpenAPI-shaped YAML file. An empty file returns `{}`. It throws if the file is missing.
- `readModuleFragment(modulesRoot, module)` — reads `<modulesRoot>/<module>/openapi.yaml` via `readOpenApiFragment`.
- `AuthorizationRule` (`action`, `subject`, `module`), `AuthorizationSet` (`name`, `module`, `rules` as `action:Subject` keys), `AuthorizationFragment` (`rules`, `sets`) — the types for an `authorization.yaml`.
- `readAuthorizationFragment(file)` — reads an `authorization.yaml`-shaped file. It returns `{ rules: [], sets: [] }` if the file is absent, and defaults missing `rules` or `sets` to `[]`.

## Relationships
The neighbor files are the contract-assembly and scaffold steps and one test. They sit on the dependency graph around this module, and it is presumably the shared reader they use. Only what the file itself shows is stated here:
- The `TAG_FAMILY_OF_GROUP` doc comment says the scaffolder uses it, which fits the `scripts/scaffold/*` neighbors.
- `x-cache` in the `paths` shape matches `tests/cross-cutting/cache-policy-declared.test.ts`, and `x-personal-data` matches `personal-data-assembly.ts`. The file itself does not name either.
- `authorization-bundle.ts` and `scripts/scaffold/demo-remove-authorization.ts` are the likely consumers of the authorization types.

## Notes
- Parsing uses the `yaml` package (YAML 1.2). Results are cast with `as`, so nothing is validated at runtime. For example, `DeclaredSection.schema` is `unknown` and "its shape is checked where it is used".
- The two readers differ on missing files. `readAuthorizationFragment` tolerates absence, while `readOpenApiFragment` does not check and will throw.
- `readAuthorizationFragment` does not guard against an empty file. An empty `authorization.yaml` parses to `null`, so reading `.rules` on it would throw, unlike the OpenAPI reader, which falls back to `{}`.
