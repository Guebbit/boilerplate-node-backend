---
source: tests/cross-cutting/raw-body-paths.test.ts
sha256: 896352fe323bbc96ea85e7c89134bd1c875edb4e51aae63bc14c8af8c42f6265
generated_at: 2026-09-23T19:59:10.857804+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/raw-body-paths.test.ts

## Purpose

Cross-cutting validation that every module's `rawBodyPaths` entries correspond to a route actually mounted on that module's own router. It exists to catch typos that would silently disable signature verification: a wrong path never matches the raw-body allowlist, `express.json()` re-encodes the body, and every downstream signature check fails against bytes that are no longer the ones the caller signed — with no explicit error.

## Key elements

- **`describe('rawBodyPaths')`** — the sole test suite in the file; no exports.
- **Test: "finds at least one module declaring a raw-body path"** — canary assertion that at least one enabled module declares a non-empty `rawBodyPaths`, preventing the second test from passing vacuously on an empty sweep.
- **Test: "resolves every declared path to a route mounted on the same module's router"** — flattens all enabled modules, builds a `Set` of path strings from each module's mounted routes (via `routeSignatures`), and asserts that every declared `rawBodyPaths` entry is present in that set. Reports each violation as a labelled string (module name + path) for easy diagnosis.

## Relationships

- **`src/modules.ts`** — imports `enabledModules`, the array of active module descriptors that the test iterates over.
- **`tests/support/routes.ts`** (imported as `@tests/routes`) — imports `routeSignatures`, which extracts `"METHOD /path"` signature strings from a module's route table so the test can compare declared paths against actually mounted ones.

## Notes

- The comparison is purely string-based on the path segment (second token of each signature). A path that matches a route on a *different* module's router will still fail this test, because the set is built per-module.
- `rawBodyPaths` is optional per module (`?? []`); the canary test ensures the suite doesn't silently pass when no module opts in.
- The failure mode being guarded against is entirely silent at runtime (no thrown error, no log) — this test is the only automated safeguard.
