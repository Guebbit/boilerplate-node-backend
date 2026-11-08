---
source: scripts/pairing/paired-frontend-path.ts
sha256: a9e3fc104585b43bfa6bac9c809b077d7d30134e7232a76db59e8daf850f1d78
generated_at: 2026-11-08T02:56:26.082134+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/paired-frontend-path.ts

## Purpose

Centralizes resolution of the paired frontend checkout's absolute file-system path. Every script that needs to read or write the sibling frontend (sync, identity checks, doc reference checks) calls into this module so they all agree on *which* checkout they target, regardless of whether the path came from a one-off env var, a per-lane `.env`, or the default sibling layout.

## Key elements

- **`DEFAULT_FRONTEND_PATH`** (exported const) — `'../boilerplate-vue-frontend'`, the fallback location assumed when nothing else is set. Mirrored by `<frontend>/scripts/pairing/paired-backend-path.ts`.
- **`frontendPathFromEnvironmentFile()`** (module-private) — Reads `FRONTEND_PATH` from `./env` in the working directory via `parseEnv` (not `process.loadEnvFile`), returning `undefined` if no `.env` exists. Isolated so the parse result never leaks into child-process environments.
- **`resolveFrontendPath()`** (exported fn) — Returns an absolute path, applying a three-tier fallback: real `process.env.FRONTEND_PATH` → `.env` value → `DEFAULT_FRONTEND_PATH`. Uses `||` (not `??`) so that an empty string counts as unset.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** and **`scripts/pairing/sync-to-frontend.ts`** — Sibling pairing scripts that import `resolveFrontendPath` to locate the frontend they compare against or write into.
- **`scripts/docs/check-references.ts`** / **`scripts/regenerate-artifacts.ts`** — Cross-repo tooling that uses the resolved path to reach into the frontend tree.
- **`tests/unit/scripts/pairing/paired-frontend-path.test.ts`** — Unit tests covering the resolution precedence and the empty-string edge case.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Indirectly depends on correct path resolution when verifying spec identity across repos.

## Notes

- **Empty-string trap.** `.env-example` declares `FRONTEND_PATH =` with no value, so a freshly copied `.env` defines it as `''`. Using `??` would treat `''` as a valid value and resolve to the repo's own root, silently comparing the backend against itself. The `||` chain is deliberate.
- **Contract with the mirror file.** `DEFAULT_FRONTEND_PATH` and the frontend's `DEFAULT_BACKEND_PATH` must stay in sync. Changing one without the other breaks the identity check in only one direction — the hard-to-diagnose half.
- **Why `parseEnv` and not `process.loadEnvFile`.** `loadEnvFile` mutates `process.env` globally; `parseEnv` returns a plain object, so the script's children inherit a clean environment.
- **CI has no `.env`.** The `existsSync` guard is the normal path in CI, not an error condition.
