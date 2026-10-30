---
source: tests/cross-cutting/api-key-authentication.test.ts
sha256: 34460e757155b4398ebecfa7ca92a8d5367b7be5e669ac385844a6fe1adc721c
generated_at: 2026-10-29T06:42:30.876455+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-authentication.test.ts

## Purpose

Proves that an `sk_…` API-key credential actually clears the identity guard (`isAuthOrCredential`) on the real mounted Express chain and reaches the permission check below it — the "middle link" that neither the api-key unit suite nor the session-based contract suite covers. A second half scans each module's `routes.ts` source to assert that exactly one identity guard is mounted per module, preventing the state where some routes admit credentials and others do not with no rule saying which.

## Key elements

- **`describe('an api key over the real chain')`** — integration tests hitting real routes over the mounted chain:
  - Credential with `read:User` gets 200 on `/users` (guard passes, permission passes).
  - Same credential gets **403** (not 401) on `/webhooks/subscriptions` (guard passes, permission fails).
  - Credential gets **401** on caller-subject routes (`/cart`, `/account/sessions`, `/account`) — filtered by `isDeployed`.
  - Unknown `sk_` token → 401 with `WWW-Authenticate` header on a public route.
  - Expired session bearer on a public route → still 200 (only `sk_` keys are rejected).
  - Credential cannot `POST /api-keys` to mint another credential → 401.
- **`describe('the guard split')`** — source-level scan over every `MODULES_ROOT/*/routes.ts`:
  - `codeOf(file)` reads the file and strips comment lines (`*`, `//`, `/*`).
  - Asserts that `isAuth` and `isAuthOrCredential` are never both present in the same module's route file.

## Relationships

- **`tests/support/credentials.ts`** — supplies `credentialHolding(permissions)`, which mints a real `sk_…` token in the test DB with the given permission list.
- **`tests/support/http.ts`** — supplies the `api()` HTTP client used for every request in the file.
- **`tests/support/paths.ts`** — supplies `isDeployed(module)` (to skip routes from removed modules) and `MODULES_ROOT` (to enumerate `routes.ts` files for the guard-split scan).
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb()`, called once at module top level to reset the database before the suite runs.

## Notes

- The `codeOf` helper deliberately strips comment lines because `orders` and `api-keys` each contain a prose comment *naming* the guard they chose **not** to mount; a raw-text regex would flag those as violations.
- The "no controller behind `isAuthOrCredential` reads `request.authContext`" rule is explicitly **not** here — it lives in `tests/cross-cutting/authenticated-controllers.test.ts`, which inspects Express's resolved stack per route rather than scanning file text.
- The 403-vs-401 distinction is the design intent of the two-guard split: 401 means the identity guard rejected the credential; 403 means the credential was accepted but lacks the required permission key.
