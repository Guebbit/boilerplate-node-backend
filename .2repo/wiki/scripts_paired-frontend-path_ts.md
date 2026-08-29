# scripts/paired-frontend-path.ts

## Purpose

Resolves the absolute path to the paired Vue frontend checkout so that cross-repo scripts (contract checks, artifact regeneration, shared-file sync) can locate the sibling repo without hard-coding paths. It centralises the env-var override (`FRONTEND_PATH`) and the fallback convention into a single, testable helper.

## Key elements

- **`DEFAULT_FRONTEND_PATH`** — Exported constant (`'../boilerplate-vue-frontend'`). The assumed sibling location relative to this repo's root.
- **`resolveFrontendPath()`** — Exported function returning an absolute path. Reads `process.env.FRONTEND_PATH`, trims it, and falls back to `DEFAULT_FRONTEND_PATH` when the value is falsy *or* empty. Always resolved against `process.cwd()`.

## Relationships

- **`scripts/check-spec-identity.ts`**, **`scripts/regenerate-artifacts.ts`**, **`scripts/sync-shared-files-to-frontend.ts`** — Import `resolveFrontendPath` (and/or `DEFAULT_FRONTEND_PATH`) to obtain the frontend root before performing their cross-repo work.
- **`tests/cross-cutting/frontend-pairing.test.ts`** — Exercises the resolution logic and the pairing contract this file defines.
- **`tests/unit/scripts/spec-identity.test.ts`** — Relies on the resolved path when setting up its fixtures.
- **`scripts/paired-backend-path.ts`** (in the *frontend* repo) — Mirror counterpart; the two repos must agree on the relative location for the contract to hold in both directions.

## Notes

- **Empty-string env var:** `process.env.FRONTEND_PATH` is deliberately handled with `||` (not `??`) after `.trim()`. The shipped `.env-example` declares `FRONTEND_PATH =` with no value, so a copied `.env` sets it to `''`. Using `??` would treat `''` as a valid path, resolving to the *current* repo root and causing the backend to compare against itself.
- **Cwd-dependent:** The function resolves relative to `process.cwd()`, not `__dirname`. Callers must ensure they run from the repo root (or an ancestor that keeps the `../boilerplate-vue-frontend` relative path valid).
- **Symmetry contract:** Changing `DEFAULT_FRONTEND_PATH` without updating the corresponding `paired-backend-path.ts` in the frontend repo will break the contract check in only one direction, producing a confusing asymmetric failure.
