---
source: tests/cross-cutting/api-key-security.test.ts
sha256: 5f7fb95f3724b63aa70a73e684d2669bb3e8d09f057adf72441fd8833411bda8
generated_at: 2026-10-15T12:35:19.872107+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-security.test.ts

## Purpose

Cross-cutting test that asserts the OpenAPI contract's `apiKeyAuth` security declarations are in sync with the route guards actually mounted in the server. An operation must list `apiKeyAuth` exactly when its route uses `isAuthOrCredential` without a step-up permission, or when it is one of the hand-listed anonymous-readable product endpoints. A route that gains or loses the guard fails this test until the spec is updated to match.

## Key elements

- **`KEY_AWARE_OPTIONAL_READS`** — `Set` of operations (e.g. `GET /products`) that are anonymous-readable but grant an API key a wider view. Populated only when the `products` feature is deployed; otherwise empty.
- **`specSecurity()`** — Reads and parses `openapi.yaml` at repo root; returns a `Map<string, Security | undefined>` keyed by `METHOD /path` (spec spelling).
- **`listsApiKey(security)`** — Returns `true` if any requirement in the operation's security array contains the `apiKeyAuth` scheme name.
- **`mounted`** — Derives the set of mounted routes that also appear in the spec, normalising `:param` → `{param}` and stripping trailing slashes to match spec path spelling.
- **`describe("apiKeyAuth in the contract matches the routes that admit a key")`** — Three assertions:
  1. Sanity check that both the route table and the spec contain a non-trivial number of entries.
  2. `it.each` over every mounted operation: `listsApiKey` must equal the computed `admitsKey` guard/permission check (guard present **and** no `stepUp`), OR the operation is in `KEY_AWARE_OPTIONAL_READS`.
  3. Verifies the hand-listed optional reads are actually present in the spec as optional (zero-key security requirement) and that no other optional operation lists `apiKeyAuth`.

## Relationships

- **`tests/support/contract-routes.ts`** — Provides `everyMountedRoute()`, the source of truth for which routes are mounted, their guards, and their permission keys.
- **`src/kernel/permissions.ts`** — Provides `findKey(permissionKey)` so the test can inspect whether a route's permission carries a `stepUp` flag (a step-up means a key cannot complete the operation, so `apiKeyAuth` must be absent).
- **`tests/support/paths.ts`** — Provides `REPO_ROOT` (to locate `openapi.yaml`) and `isDeployed('products')` (to conditionally populate `KEY_AWARE_OPTIONAL_READS`).

## Notes

- The test is a *canary*: it pins the hand-listed `KEY_AWARE_OPTIONAL_READS` to the spec in **both** directions (they must appear as optional in the spec, and no other optional operation may list `apiKeyAuth`). Remove or add a product endpoint without updating this set and the test fails.
- "Optional" in the spec is identified structurally: a security requirement whose `Object.keys(requirement).length === 0` (i.e. an empty object meaning "no auth required").
- Path normalisation (`:param` → `{param}`, trailing-slash strip) is a local concern of this test; the spec uses the latter convention while the router uses the former.
- The sanity-check test (`mounted.length > 100`, `> 20` apiKey entries) exists to guard against a broken `openapi.yaml` path or a stubbed router silently producing empty lists and making the `it.each` block vacuously pass.
