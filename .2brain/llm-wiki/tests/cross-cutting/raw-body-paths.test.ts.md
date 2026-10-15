---
source: tests/cross-cutting/raw-body-paths.test.ts
sha256: f89cf5e578f1401ff8b3e32c718b46e15200ae819eaa4689369cfe1ab626ab26
generated_at: 2026-10-15T12:40:04.186394+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/raw-body-paths.test.ts

## Purpose

Validates that every entry in a module's `rawBodyPaths` array matches a route actually mounted on that module's own router. This is a safety net for `app/security.ts`, which string-concatenates `basePath` + each `rawBodyPath` into the `express.json()` raw-body allowlist; a typo there would silently cause the body to be re-encoded before the module's handler runs, breaking signature verification with no visible error.

## Key elements

- **`describe('rawBodyPaths')`** — the suite containing two tests.
- **Canary test** (`'finds at least one module declaring a raw-body path'`) — asserts that at least one enabled module has a non-empty `rawBodyPaths` array (conditional on `payments` being deployed) so the second test doesn't pass vacuously.
- **Resolution test** (`'resolves every declared path to a route mounted on the same module's router'`) — for each module with `rawBodyPaths`, builds a `Set` of path strings extracted from `routeSignatures(appModule.routes)` and asserts no declared path is missing from that set. Reports all dangling paths in a single `expect` for readable failure output.

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the array of module descriptors that supply `name`, `rawBodyPaths`, and `routes` for iteration.
- **`tests/support/paths.ts`** — provides `isDeployed(moduleName)` used by the canary test to conditionally gate the "at least one declares" assertion on whether `payments` is in the deployment set.
- **`tests/support/routes.ts`** — provides `routeSignatures(routes)`, which yields `"METHOD /path"` strings from a module's route array; the test splits each on the first space to extract the path for the membership check.

## Notes

- The canary test is deployment-aware: when `payments` is not deployed, it only checks that *some* module exists, since an empty `rawBodyPaths` set is a valid state without `payments`.
- Route signature parsing assumes the `"METHOD path"` format (split on first space, take index 1). If a signature ever gains extra whitespace or a different shape, this test will silently mis-parse.
- The failure message in the resolution test is pre-formatted per module (`"moduleName: rawBodyPaths declares …"`) so a single `expect(dangling).toEqual([])` surfaces all offenders at once rather than failing on the first.
