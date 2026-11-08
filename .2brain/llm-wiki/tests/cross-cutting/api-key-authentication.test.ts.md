---
source: tests/cross-cutting/api-key-authentication.test.ts
sha256: db49e8aff8fa8340c7f31b8c54920b0c31c5f3b09c8dc9ba4d5ba464e7f8d1d5
generated_at: 2026-11-08T09:23:02.597308+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-authentication.test.ts

## Purpose

Proves that an `sk_…` credential actually traverses the real Express chain to reach a route whose identity guard is `isAuthOrCredential` — the "middle link" that neither the unit-level `resolveCredential` tests nor the session-token contract tests cover. A second half statically verifies that no module mounts both identity guards (`isAuth` and `isAuthOrCredential`), keeping the credential-eligibility of a route a property of its module rather than of individual lines.

## Key elements

- **`describe('an api key over the real chain')`** — request-level tests:
  - 200 on a tenant route the credential's permission covers.
  - 403 (not 401) on a route the credential authenticates to but lacks permission for.
  - 401 (never 500) on self-referencing routes (`/cart`, `/account`, `/account/sessions`) filtered by `isDeployed`.
  - 401 for a syntactically valid but unknown `sk_` key.
  - 401 + `WWW-Authenticate: Bearer error="invalid_token"` on a public route with a bad `sk_` key (RFC 6750 §3.1).
  - 404 (served as anonymous) on a public route with an expired session bearer — only `sk_` keys are rejected.
  - 401 when attempting to mint a second credential via `POST /api-keys` (credential minting stays a human/session act).
- **`codeOf(file)`** — reads a file, strips comment lines, returns the code text for regex matching.
- **`describe('the guard split')`** — iterates every `routes.ts` under `MODULES_ROOT`; asserts `isAuth` and `isAuthOrCredential` never both appear in the same file's code.

## Relationships

- **`tests/support/credentials.ts`** — `credentialHolding(permissions)` mints a real `sk_` credential with the specified permission set for use in requests.
- **`tests/support/http.ts`** — `api()` returns a Supertest-style client bound to the running test server.
- **`tests/support/paths.ts`** — `isDeployed(owner)` gates route tests to skip undeployed modules; `MODULES_ROOT` is the directory the guard-split test enumerates.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a per-test-database before any test runs.

## Notes

- `codeOf` strips `//`, `*`, and `/*` lines before the regex check because two modules (`orders`, `api-keys`) carry prose comments that *name* a guard to explain why it is **not** mounted; a raw-text match would flag those as violations.
- The public-route test deliberately targets a foundation route (`/account/oauth/not-a-provider`) so it remains valid even when the shop module is removed via `demo:remove`.
- The guard-split test is source-level (reads `routes.ts` files on disk) rather than request-level, because it asserts a structural invariant that a request could only probe if someone had already added the route to the test matrix.
