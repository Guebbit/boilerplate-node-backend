---
source: scripts/modules-on-disk.ts
sha256: d65a2046f2869acc55c00bccd34073a88980455085b9fa84ff24953966703d09
generated_at: 2026-11-08T02:51:53.744461+00:00
model: ollama:qwen3.8:27b
---

# scripts/modules-on-disk.ts

## Purpose

Single source of truth for "where are the repo's modules on disk." Any build step that needs to enumerate modules carrying a particular artifact (a contract fragment, a probe list, a descriptor) imports from here instead of re-walking `src/modules` with its own logic.

## Key elements

- **`REPO_ROOT`** – Resolved absolute path to the repository root (one level up from `scripts/`).
- **`MODULES_ROOT`** – Absolute path to `src/modules`.
- **`modulesWith(modulesRoot: string, file: string): string[]`** – Reads a modules directory and returns the sub-directory names (alphabetically) that contain a given relative file or folder (e.g. `openapi.yaml`, `tests`). Accepts an arbitrary root so tests can point it at a scratch tree.

## Relationships

This file is a leaf utility (imports only `node:fs` and `node:path`); all graph neighbors are **consumers** that import `REPO_ROOT`, `MODULES_ROOT`, or `modulesWith`:

- **`scripts/contracts/*`** (build-bundles, openapi-bundle, asyncapi-bundles, root-assembly, client-collections-bundle, authorization-bundle, check-asyncapi-breaking, generate-shared-rule-schemas, asyncapi-section-fragments, openapi-extensions, analytics-browser-events, bundle-registry) – enumerate modules that carry specific contract artifacts.
- **`scripts/audit/code-shape/scripts/generate-shallow-candidates.ts`** – walks modules to build audit candidate lists.
- **`scripts/docker/generate-dockerfile-dockerignore.ts`** – resolves repo layout for Docker context.
- **`scripts/docs/check-references.ts`** – discovers module folders to validate doc references.

## Notes

- `modulesWith` returns names in **alphabetical** order; callers that need a narrative/semantic order are expected to pipe the result through their own `orderSections` helper (referenced in the doc comment but not defined here).
- The function takes `modulesRoot` as a parameter rather than closing over `MODULES_ROOT` specifically so tests can supply a temporary directory.
- `REPO_ROOT` is derived from `__dirname` at module load time; it will be `undefined` under ESM-only tooling that strips `__dirname`. The current build targets CommonJS/`.ts` transpilation, so this is not an issue today.
