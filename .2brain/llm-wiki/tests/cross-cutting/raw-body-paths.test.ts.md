---
source: tests/cross-cutting/raw-body-paths.test.ts
sha256: 6572195f37cbba5ca5406fd4ba20422013271ab8a032df201ac24aebe53576b3
generated_at: 2026-10-29T06:49:05.841966+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/raw-body-paths.test.ts

## Purpose

Cross-cutting invariant test: every module's `rawBodyPaths` entry must correspond to a route actually mounted on that module's own router. This guards against a silent failure mode where `app/security.ts` concatenates these paths into the `express.json()` raw-body allowlist — a typo simply means the path never matches, the body gets re-encoded before the module sees it, and all downstream signature checks fail with no error raised.

## Key elements

- **`describe('rawBodyPaths')`** — top-level suite containing two tests.
- **Canary test** (`finds at least one module declaring a raw-body path`) — asserts the sweep isn't vacuously passing. If `payments` is deployed, at least one module must declare a raw-body path; otherwise only asserts `enabledModules` is non-empty.
- **Resolution test** (`resolves every declared path to a route mounted on the same module's router`) — for each module with `rawBodyPaths`, builds a `Set` of mounted route paths (via `routeSignatures`) and checks that each declared path either equals a mounted route or is a segment-boundary prefix of one. Collects all dangling paths into a `dangling` array and asserts it is empty.

## Relationships

- **`src/modules.ts`** — imports `enabledModules`; the test iterates over this list to walk every active module and its `rawBodyPaths` / `mounts` declarations.
- **`tests/support/paths.ts`** — imports `isDeployed` to conditionally gate the canary assertion on whether the `payments` module is present in the current deployment.
- **`tests/support/routes.ts`** — imports `routeSignatures` to extract the `"METHOD /path"` strings from a module's router, from which the test builds its set of actually-mounted route paths.

## Notes

- Prefix matching is intentional: a declared path like `/webhook` covers child routes such as `/webhook/:provider` because the JSON-parser allowlist matches at a segment boundary. The test encodes this with `route === path || route.startsWith(path + '/')`.
- Only `appModule.mounts[0].routes` is inspected. If a module declares multiple mounts, only the first is considered — this reflects how `security.ts` composes the allowlist using the first mount's `basePath`.
- The test is deliberately cross-cutting: it does not test any single module's logic but the *consistency* across the module registry.
