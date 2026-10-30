---
source: tests/contract/route-spec-parity.test.ts
sha256: b46e12ea789143c8677c3195148949c14fd287478466cb2856c6598250ec0bc7
generated_at: 2026-10-29T06:41:03.745821+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/route-spec-parity.test.ts

## Purpose

Contract-parity test that asserts the set of HTTP operations the app actually mounts (read from live Express routers via the module registry) is identical to the set of operations declared in the bundled `openapi.yaml`. It checks both directions — no undocumented endpoints, no unfulfilled declarations — plus a no-duplicates guard and a vacuous-pass guard.

## Key elements

- **`HTTP_METHODS`** — `Set` of the five standard verbs that count as OpenAPI path-item operations.
- **`toSpecPath(expressPath)`** — Rewrites Express-style `:param` segments to OpenAPI `{param}`.
- **`operationsOf(prefix, router)`** — Calls `routeTable` on a single router and returns `METHOD /spec/{path}` keys prefixed with the mount path.
- **`mountedOperations()`** — Flattens every enabled module's `mounts` (basePath + routes) plus the system router into one list of operation keys.
- **`declaredOperations()`** — Parses `openapi.yaml` from disk and extracts every `METHOD /path` key.
- **`isTestLever(operation)`** — True for any key containing ` /__test/`, used to exclude the demo extension's levers.
- **`describe` block** — Four tests: non-empty guard (>100 on each side), mounted ⊆ declared, declared ⊆ mounted, and no duplicate mounted operations.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`, the registry of enabled modules. Each entry's `mounts` array supplies the `basePath` and `routes` (Express router) that `operationsOf` reads. Using the registry (rather than a booted app) works around Express 5 dropping mount-path metadata from its router stack.
- **`src/app/system-routes.ts`** — Imports `router` (the system router). It is read at mount prefix `''` (root) and contributes its operations to the mounted set.
- **`tests/support/routes.ts`** — Imports `routeTable`, the walker that inspects an Express router's internal stack and returns `{ method, path }` pairs. This is the only mechanism by which the test discovers what a router actually serves, including routes registered in loops or helpers.

## Notes

- The test reads **live routers**, not source text, so dynamically registered routes (loops, helper calls, renamed imports) are captured correctly.
- Express 5's router stack does not record mount paths, which is why the registry (`enabledModules`) is used instead of calling `app.routes()` on a booted instance.
- `/__test/*` routes (mounted by a process option for the demo extension) and `express.static` mounts are **deliberately excluded** on both sides before comparison.
- The first test (>100 entries on each side) is a guard against a `routeTable` or spec-parsing regression silently producing two empty lists and letting the parity assertions pass vacuously.
- The no-duplicates test catches a second registration of the same `METHOD /path`, which Express would let the first handler win, making the second unreachable and the contract ambiguous.
