---
source: tests/cross-cutting/api-key-security.test.ts
sha256: f208b33f4fc6e6f2b540a2b7be71ee878c7356ec86ced34615828c2b1fdd0657
generated_at: 2026-10-29T06:42:46.721015+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-security.test.ts

## Purpose

Cross-cutting consistency test that verifies the OpenAPI spec's `security` declarations for `apiKeyAuth` match the actual route guards. For every mounted route present in the spec, it asserts that `apiKeyAuth` appears in the operation's security list **if and only if** the route mounts `isAuthOrCredential` and none of its permissions require step-up (which an API key cannot satisfy). This catches drift in either direction: a guard added/removed without updating the spec, or a spec listing `apiKeyAuth` on a route that no longer admits it.

## Key elements

- **`Security`** — type alias for `Record<string, string[]>[]`, the shape of an OpenAPI `security` field.
- **`KEY_AWARE_OPTIONAL_READS`** — a `Set` of operations (`GET /products`, `POST /products/search`, `GET /products/{id}`) that are anonymous-readable (guard is `getAuth` only) but grant a wider view to key holders. Conditionally empty when `products` is not deployed. Hand-maintained because the guard-based check cannot detect them.
- **`specSecurity()`** — reads and parses `openapi.yaml` at repo root, flattens all path/method entries into a `Map<string, Security | undefined>` keyed by `"METHOD /spec/{path}"`.
- **`listsApiKey(security)`** — returns `true` if any requirement in the security list contains the `apiKeyAuth` scheme.
- **`mounted`** — the intersection of every mounted route (from `everyMountedRoute()`) with the spec, with Express-style `:param` paths rewritten to OpenAPI `{param}` form.
- **Test: "reads a route table and a spec…"** — sanity guard that both data sources are non-trivially populated (>100 mounted routes, >20 `apiKeyAuth` entries).
- **Test: `it.each(mounted…)`** — the core assertion: for each operation, `listsApiKey` in the spec equals `(route admits key) OR (operation ∈ KEY_AWARE_OPTIONAL_READS)`. "Admits key" means the route's guards include `isAuthOrCredential` **and** every permission's rule has no `stepUp`.
- **Test: "keeps the hand-listed optional reads real…"** — verifies that the spec's truly-optional operations (empty requirement object) are exactly `KEY_AWARE_OPTIONAL_READS` (when `products` is deployed) and that each of those operations is actually mounted.

## Relationships

- **`src/kernel/permissions.ts`** — provides `findRule` and `ruleId` to resolve a permission's rule and check for a `stepUp` field. A step-up requirement disqualifies API-key access even if `isAuthOrCredential` is mounted.
- **`tests/support/contract-routes.ts`** — provides `everyMountedRoute()`, the canonical list of routes with their `guards` and `permissions` arrays, used as the source of truth for runtime behavior.
- **`tests/support/paths.ts`** — provides `REPO_ROOT` (to locate `openapi.yaml`) and `isDeployed('products')` (to conditionally include the product read operations in `KEY_AWARE_OPTIONAL_READS`).

## Notes

- `KEY_AWARE_OPTIONAL_READS` is the **only** hand-maintained list in the file. If `products` gains or loses an anonymous-readable operation, this set must be updated manually; the test will fail in both directions (missing entry or extra optional operation).
- The path rewrite `route.path.replaceAll(/:(\w+)/g, '{$1}')` assumes a simple one-to-one parameter mapping; nested or optional route segments may not survive the rewrite correctly.
- The test only asserts over the **intersection** of mounted routes and spec operations. A route that is mounted but absent from the spec (or vice-versa) is silently skipped, not flagged.
- The `stepUp` check uses `findRule(ruleId(ask.action, ask.subject))?.stepUp === undefined`, so a rule that is *missing* (returns `undefined`) is treated the same as a rule with no step-up — both allow key auth.
