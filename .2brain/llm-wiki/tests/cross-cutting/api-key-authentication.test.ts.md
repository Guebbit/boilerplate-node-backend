---
source: tests/cross-cutting/api-key-authentication.test.ts
sha256: 34c6f7eb68f91d4ee6b528a91106a57fd9640cd04705b1b528bb2fa72353bcc9
generated_at: 2026-10-15T12:35:06.505323+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-authentication.test.ts

## Purpose

Proves that the identity guard layer (the "middle link" between credential resolution and permission checking) actually admits `sk_…` API-key credentials onto routes built to accept them, over the real mounted Express chain. No other suite covers this seam: the api-key suite drives `resolveCredential` directly, and the contract suite uses session tokens. This file splits into two halves — behavioral assertions against live routes, and a structural scan ensuring no module accidentally mounts both identity guards.

## Key elements

- **`describe('an api key over the real chain')`** — five behavioral tests:
  - *200 on permitted route*: a credential holding `users.any.read` reaches `GET /users`.
  - *403 on unpermitted route*: same credential hits `GET /webhooks/subscriptions`; 403 (not 401) confirms the identity guard passed but permission failed.
  - *401 on caller-subject routes* (`/cart`, `/account/sessions`, `/account`): filters out non-deployed modules via `isDeployed`; asserts 401 rather than a 500 from a controller that assumes a session.
  - *401 on unknown credential*: a garbage Bearer token is rejected at the guard.
  - *401 on credential minting*: `POST /api-keys` with a valid credential is refused — minting stays a human act.
- **`describe('the guard split')`** — iterates every `routes.ts` under `MODULES_ROOT`; asserts no file contains both `isAuth` and `isAuthOrCredential` in its code.
- **`codeOf(file)`** — reads a source file, strips comment lines (`//`, `*`, `/*`), and returns the remaining code. Used so that prose comments *naming* a guard (e.g. in `orders`, `api-keys`) are not misread as mounts.

## Relationships

- **`tests/support/credentials.ts`** — `credentialHolding(permissions)` mints a test credential with the specified permission set; every behavioral test relies on it.
- **`tests/support/http.ts`** — `api()` returns a superagent instance wired to the real Express app under test; all HTTP calls go through it.
- **`tests/support/paths.ts`** — `isDeployed(module)` gates the caller-subject route list; `MODULES_ROOT` is the directory scanned by the guard-split structural test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level (before any test) to prepare the database the routes query.

## Notes

- The 403-vs-401 split is the core assertion: 403 means "credential valid, permission missing"; 401 means "identity guard rejected." Conflating them would mask a broken guard.
- The structural test is source-level (regex over code text) rather than request-level, because a request test can only reach routes someone remembered to add. It intentionally scans code, not comments, to avoid false positives from well-documented exclusions.
- This file does **not** assert that controllers behind `isAuthOrCredential` avoid reading `request.authContext`; that responsibility belongs to `tests/cross-cutting/authenticated-controllers.test.ts`, which checks per-route off Express's resolved stack.
- The caller-subject route list is dynamically filtered by `isDeployed`, so tests for removed modules (e.g. `demo:remove`) are silently skipped rather than failing.
