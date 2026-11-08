---
source: tests/cross-cutting/cache-policy-declared.test.ts
sha256: 8de85c1e1da95481212f2997ce7300345d07c7466401d185aa130aeb9b787f90
generated_at: 2026-11-08T09:24:41.715669+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/cache-policy-declared.test.ts

## Purpose

Cross-cutting consistency test that verifies the OpenAPI contract's `x-cache` annotations on GET operations and the router middleware's mounted cache policies name exactly the same set of routes. Without this check, the bundler (which can only read `x-cache` and emit a `304`) would either document a response the route never produces or omit one it does.

## Key elements

- **`X_CACHE_VALUE`** — Regex accepting the four allowed spellings: `private-no-cache`, `revalidate`, `max-age: <n>`, `no-store`.
- **`isMounted(policy)`** — Returns `false` for `no-store` (set by the controller on a streamed file, not by middleware) so the both-ways equivalence skips it.
- **`declaredReads(module)`** — Reads a module's OpenAPI fragment and returns a `route → x-cache value` map for every `get` that carries the annotation.
- **`contracted`** — Subset of `enabledModules` that actually ship an `openapi.yaml` (excludes the `example` template).
- **Canary test** — Asserts at least one cached read path exists across all contracted modules, preventing a vacuous pass.
- **`it.each` equivalence test** — For every contracted module, asserts the sorted list of mounted (non-`no-store`) declared routes equals `cachedReadPaths(mounts)`, and that every declared value matches `X_CACHE_VALUE`.

## Relationships

- **`src/modules.ts`** — Source of `enabledModules`; provides module names and their `mounts` array.
- **`tests/support/cached-routes.ts`** — Provides `cachedReadPaths(mounts)`, the ground-truth set of GET routes where cache middleware is actually wired.
- **`scripts/contracts/fragments.ts`** — Provides `readModuleFragment` to parse a module's `openapi.yaml` into a typed path map.
- **`scripts/modules-on-disk.ts`** — Provides `MODULES_ROOT`, the filesystem root used to locate each module's directory.

## Notes

- `no-store` is deliberately excluded from the route-set comparison (only the four *other* values participate in the equality check), but it **is** still validated against `X_CACHE_VALUE` in the value loop.
- Uses `Array.prototype.toSorted()` (non-mutating) rather than `.sort()`; requires a runtime that supports it.
- The test is "cross-cutting" in the project's sense: it bridges the static contract layer and the runtime middleware layer, neither of which can see the other on its own.
