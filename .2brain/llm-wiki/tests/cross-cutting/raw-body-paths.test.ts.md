---
source: tests/cross-cutting/raw-body-paths.test.ts
sha256: f0aded4a11c31723784444c25b66cfcf958790d220f5e9b5dfd8f9e5c9a27ac3
generated_at: 2026-11-14T23:06:37.682380+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/raw-body-paths.test.ts

## Purpose

Cross-cutting guard that ensures every module's `rawBodyPaths` entries resolve to a route actually mounted on that module's own router. A typo or stale entry here silently disables signature verification (because `express.json()` re-encodes the body before the module reads it), so this test catches the failure at build time rather than in production.

## Key elements

- **`describe('rawBodyPaths')`** — the sole test suite; no exported helpers.
- **Test 1 — canary ("finds at least one module declaring a raw-body path")** — asserts the sweep isn't vacuous. Falls back to asserting `enabledModules.length > 0` when the `payments` module is not deployed, since an empty declaration set is the *correct* answer in that case.
- **Test 2 — route-resolution check** — for every path in each module's `rawBodyPaths`, verifies the path (or a prefix of a mounted route) exists among that module's first mount's routes. Reports all dangling paths in a single `dangling` array rather than failing on the first hit.

## Relationships

- **`src/modules.ts`** → imports `enabledModules`; iterates each module's `rawBodyPaths` and `mounts[0].routes`.
- **`tests/support/paths.ts`** → imports `isDeployed` to determine whether the `payments` module is active, gating the canary assertion.
- **`tests/support/routes.ts`** → imports `routeSignatures` to extract `"METHOD /path"` strings from a module's route table, from which the path segment is split out.

## Notes

- **Prefix semantics:** a declared path `/webhook` is considered to "cover" a mounted route `/webhook/:provider` because the JSON-parser allowlist matches at a segment boundary. The test encodes this with `route.startsWith(`${path}/`)`.
- **Only the first mount is inspected.** Modules that declare `rawBodyPaths` but mount routers in a different position are not validated by this test.
- **Failure mode this prevents:** a path typo causes `express.json()` to parse and re-serialize the body before the handler runs, so every downstream HMAC/signature check compares against wrong bytes. There is no runtime error—just silent auth failures.
- The canary test deliberately distinguishes "nothing declares a path" (valid when `payments` is undeployed) from "the sweep itself broke" (invalid), preventing a silent pass when `enabledModules` is empty or the filter logic is broken.
