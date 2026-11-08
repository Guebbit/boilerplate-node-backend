---
source: tests/cross-cutting/api-key-security.test.ts
sha256: f208b33f4fc6e6f2b540a2b7be71ee878c7356ec86ced34615828c2b1fdd0657
generated_at: 2026-11-08T09:23:18.209887+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-security.test.ts

## Purpose

Cross-checks the OpenAPI contract (`openapi.yaml`) against the actual mounted route guards to verify that `apiKeyAuth` appears in an operation's `security` **exactly** when the route mounts `isAuthOrCredential` and carries no step-up permission. Also pins a small hand-maintained list of anonymous-readable product operations that grant API keys a wider view. The test fails in either direction: a route gaining or losing the guard, or the spec drifting from the code.

## Key elements

- **`Security`** — local type for an operation's `security` array (`Record<string, string[]>[]`).
- **`KEY_AWARE_OPTIONAL_READS`** — a `Set` of three product-read operations (`GET /products`, `POST /products/search`, `GET /products/{id}`), populated only when `isDeployed('products')` is true. These mount no identity guard, so the guard-based check cannot name them; they are asserted separately.
- **`specSecurity()`** — parses `openapi.yaml` and returns a `Map<operation, Security | undefined>` keyed as `"METHOD /spec/path"`.
- **`listsApiKey(security)`** — returns `true` if any security requirement names `apiKeyAuth`.
- **`mounted`** — every mounted route whose normalized operation string exists in the spec, mapped to `{route, operation}`.
- **Test: "reads a route table and a spec, rather than comparing two empty lists"** — sanity guard: expects >100 mounted routes and >20 operations listing `apiKeyAuth`.
- **Test (it.each): per-route `apiKeyAuth` match** — for each mounted route, asserts `listsApiKey(spec) === (route has isAuthOrCredential && no step-up) || operation ∈ KEY_AWARE_OPTIONAL_READS`.
- **Test: "keeps the hand-listed optional reads real"** — verifies every operation in `KEY_AWARE_OPTIONAL_READS` appears among spec operations with an empty security requirement (i.e. truly optional/anonymous), and that no *other* optional operation lists `apiKeyAuth`.

## Relationships

- **`src/kernel/permissions.ts`** — imports `findRule` and `ruleId` to resolve each route permission and check whether it declares a `stepUp` (which would exclude API keys from that operation).
- **`tests/support/contract-routes.ts`** — imports `everyMountedRoute()` to obtain the full list of mounted routes with their `guards` and `permissions` arrays.
- **`tests/support/paths.ts`** — imports `REPO_ROOT` (to locate `openapi.yaml`) and `isDeployed('products')` (to conditionally populate `KEY_AWARE_OPTIONAL_READS`).

## Notes

- **Path normalization:** route params `:word` are rewritten to `{word}` and a trailing `/` is stripped before matching against the spec key. If a route path doesn't normalize cleanly, it silently drops out of `mounted` and is never tested.
- **"Optional" detection in the spec:** an operation is considered anonymous-optional when its security entry is an array containing an object with *zero* keys (e.g. `security: [{}]`). This is the only way the test identifies such operations—there is no separate `required: false` flag.
- **Deployment gate:** when `products` is not deployed, `KEY_AWARE_OPTIONAL_READS` is empty. The per-route test still passes (the `||` clause is false), and the hand-list test passes vacuously (the set has no members to check). This is intentional: the products-specific assertions are skipped rather than failing in environments without the product.
- **Two-directional canary:** the test asserts both "route admits key → spec says so" *and* "spec says so → route admits key (or is in the optional list)." A spec that adds `apiKeyAuth` to a route lacking the guard will fail, not just the reverse.
