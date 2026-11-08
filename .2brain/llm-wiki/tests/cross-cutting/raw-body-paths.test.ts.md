---
source: tests/cross-cutting/raw-body-paths.test.ts
sha256: 6572195f37cbba5ca5406fd4ba20422013271ab8a032df201ac24aebe53576b3
generated_at: 2026-11-08T09:30:52.581345+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/raw-body-paths.test.ts

## Purpose

Cross-cutting test that verifies every module's `rawBodyPaths` entries resolve to a route actually mounted on that module's own router. It exists because a typo in a declared path produces no runtime error—it silently prevents the JSON parser from keeping the raw body, so `express.json()` re-encodes it before the module reads it, and every downstream signature check fails against the wrong bytes.

## Key elements

- **Canary test (`finds at least one module declaring a raw-body path`)** — asserts the sweep isn't vacuous. If the `payments` module is deployed (checked via `isDeployed`), at least one module must declare a `rawBodyPaths` entry; otherwise only `enabledModules.length > 0` is required.
- **Resolution test (`resolves every declared path to a route mounted on the same module's router`)** — walks every enabled module, collects declared `rawBodyPaths`, and asserts each one matches (or is a segment-boundary prefix of) a route in `module.mounts[0].routes`. Dangling paths are reported as a human-readable array and asserted empty.

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the iterable list of active modules the test walks.
- **`tests/support/paths.ts`** — provides `isDeployed`, used in the canary test to conditionally tighten the assertion when `payments` is active.
- **`tests/support/routes.ts`** — provides `routeSignatures`, which extracts `"METHOD /path"` strings from a module's route definitions so the test can compare declared paths against actually mounted routes.

## Notes

- **Prefix semantics:** a declared path like `/webhook` is considered to cover `/webhook/:provider`. The check is `route === path || route.startsWith(path + '/')`, i.e. segment-boundary matching, not a simple string-prefix.
- **Silent failure mode:** the bug this test guards against has zero observable error at request time. The body is simply re-encoded by `express.json()` and the module receives JSON rather than the original bytes the caller signed. The test is the only safeguard.
- The canary test is deliberately conditional on `payments` deployment so that a config where `payments` is excluded doesn't produce a false positive.
