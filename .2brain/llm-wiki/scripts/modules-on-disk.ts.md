---
source: scripts/modules-on-disk.ts
sha256: d65a2046f2869acc55c00bccd34073a88980455085b9fa84ff24953966703d09
generated_at: 2026-10-15T09:42:12.890400+00:00
model: ollama:qwen3.8:27b
---

# scripts/modules-on-disk.ts

## Purpose

Single source of truth for where the repo root and its `src/modules` directory live on disk, plus a helper that lists which module folders carry a given artifact. Every build, contract, docs, or audit script that needs "each module that ships X" reads from here instead of re-walking the directory tree independently.

## Key elements

- **`REPO_ROOT`** (exported const) — Absolute path to the repo root, resolved one level up from `scripts/`.
- **`MODULES_ROOT`** (exported const) — Absolute path to `src/modules/`.
- **`modulesWith(modulesRoot, file)`** (exported function) — Returns alphabetically-sorted module names whose folder contains the given relative path (e.g. `openapi.yaml`, `tests`). Accepts a `modulesRoot` argument so tests can point it at a scratch tree.

## Relationships

Imported by every script that needs to enumerate modules carrying a particular artifact:

- **Contract scripts** (`build-bundles.ts`, `openapi-bundle.ts`, `asyncapi-bundles.ts`, `bundle-registry.ts`, `client-collections-bundle.ts`, `authorization-bundle.ts`, `root-assembly.ts`, `check-asyncapi-breaking.ts`, `asyncapi-webhook-events.ts`, `analytics-browser-events.ts`) — call `modulesWith` to find which modules contribute a given contract fragment or descriptor.
- **Docs scripts** (`generate-dependency-map.ts`, `generate-audit-actions.ts`, `check-references.ts`) — use the path constants and/or `modulesWith` to scope their walks.
- **Docker / audit scripts** (`generate-dockerfile-dockerignore.ts`, `generate-shallow-candidates.ts`) — rely on `REPO_ROOT` / `MODULES_ROOT` to anchor their file discovery.

## Notes

- Callers that need a narrative (non-alphabetical) order are expected to post-sort with `orderSections` (defined elsewhere); `modulesWith` always returns `.toSorted()` output.
- `modulesWith` does a synchronous `readdirSync` + `existsSync` per candidate; it is designed for build-time, one-shot use, not hot paths.
- The `modulesRoot` parameter is intentionally injectable for test isolation — pass a scratch directory rather than monkey-patching the real `MODULES_ROOT`.
