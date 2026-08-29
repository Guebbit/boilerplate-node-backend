# src/modules/account/tests/unit/auth-surface.test.ts

## Purpose

Guards the account module's public API boundary in two ways: (1) asserts that the barrel (`@modules/account`) re-exports exactly the declared names from `@modules/account/services` with object identity (not mere existence), and (2) scans the entire source tree to confirm no file outside `src/modules/account/` imports an internal path (e.g. `@modules/account/session/jwt`) that bypasses the barrel.

## Key elements

- **`ADDRESS_EXPORTS`** — `readonly` tuple listing the single cross-module surface name (`addressForCheckout`). Adding a new barrel export without updating this tuple fails the test.
- **`describe('the account barrel')`** — two tests: one checks `toBe` identity between `account[name]` and `addresses[name]` for each declared export; the other asserts `Object.keys(account)` equals exactly the declared set (no silent widening).
- **`describe('nothing outside the module reaches past the barrel')`** — a static-analysis-style sweep over every `.ts` file under `src/`. Flags any file outside the account directory whose source matches `from '@modules/account/<anything-but-module>'`.
- **`listSourceFiles(directory)`** — recursive `readdirSync` helper that collects all `.ts` files under a given root.

## Relationships

- **`src/modules/account/index.ts`** — the barrel under test. The file imports it as `@modules/account` and asserts its key set and value identities.
- **`src/modules/account/services/index.ts`** — imported as `@modules/account/services`; used as the reference implementation against which barrel re-exports are identity-compared.

## Notes

- Identity check uses `toBe` (reference equality), not `toEqual`. A barrel that re-exports a *copy* or a *different binding* will fail even if the shape looks right.
- The barrel-widening test compares sorted key arrays. A new export added to `index.ts` will fail here until explicitly added to `ADDRESS_EXPORTS`.
- The external-import scan excludes `@modules/account/module` (the manifest/registration entry point) via a negative lookahead in the regex.
- The `SOURCE_ROOT` is derived by walking four directory levels up from the test file (`tests/unit/` → `tests/` → `account/` → `modules/` → `src/`). A canary test (`finds the source tree it means to scan`) guards against a path-derivation mistake silently scanning zero files.
- This test complements ESLint's module-boundary rule (which covers `src/modules/**`); it exists to catch consumers in non-module areas like `src/middlewares/`, `src/bootstrap/`, `src/jobs/`, `src/workers/`, and `src/infrastructure/`.
