---
source: tests/contract/password-set-paths.test.ts
sha256: e665ebe70860447325af2084155ffe994aac414dbcc5451ac83670a7b5dd8e2f
generated_at: 2026-11-14T22:58:02.901798+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/password-set-paths.test.ts

## Purpose

Contract-level test that asserts every route which writes a password enforces the same breached-password check, and that the set of such routes is exactly the three owner-initiated paths — signup, authenticated change, and token-based reset. The second `describe` acts as a canary against the bundled OpenAPI spec so a new password-setting route cannot appear without adding a matching breach-check case.

## Key elements

- **`PasswordSetPath`** (interface) — shape of one entry point: a `name` and an `attempt()` that fires a real HTTP request with the breached password and returns a response plus an `assertNoChange` callback.
- **`signupPath`**, **`changePath`**, **`resetPath`** — the three concrete `PasswordSetPath` instances exercising `POST /account/signup`, `POST /account/password`, and `POST /account/password/reset/confirm` respectively.
- **`describe.each([...])`** — runs all three paths through a single assertion: expects HTTP 422 and verifies no DB row was created (signup) or the old credential still logs in (change/reset).
- **`operationsThatSetAPassword()`** — parses the bundled `openapi.yaml`, walks every operation's request body schema, and returns the sorted list of `METHOD /route` strings whose body references a `PasswordNew` schema.
- **Final `describe` ("the routes that can set a password")** — asserts the above list equals exactly the three known routes; fails if a fourth appears.
- **`BREACHED_PASSWORD`** (`'Password1!'`) — a composition-valid string present in `shared/rules/breached-passwords.txt`, ensuring the rejection is attributable to the breach list, not character rules.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`) — registers global contract-test setup. |
| `tests/support/http.ts` | Provides `api()` (supertest app) and `authenticateAs()` used to drive real HTTP requests. |
| `tests/support/paths.ts` | Exports `REPO_ROOT` used to locate the bundled OpenAPI spec on disk. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory test database before tests run. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD`, `userRepository` — fixture user creation and direct DB assertions for verifying no row after a failed signup. |
| `src/modules/account/tests/factories.ts` | `plantToken` — inserts a one-time password-reset token so the reset path can be exercised. |
| `src/modules/users/repository.ts` | Transitive dependency reached through the users factories; provides the persistence layer used by `userRepository` for DB-level assertions. |

## Notes

- **Shared implementation, distinct entry points.** `changePath` and `resetPath` both funnel into `account/services/password.ts#passwordWrite` internally; this test deliberately treats them as separate HTTP entry points so a regression in either wiring is caught, even though the underlying rule is one function.
- **Canary reads a generated artifact.** The route-enumeration test parses `openapi.yaml` at the repo root (produced by `npm run contracts:bundle`), not a per-module contract file. If that bundle is stale or missing, the canary will throw or give a wrong list.
- **`describe.each` title is data-driven.** The test titles read `"signup refuses a breached password"`, `"change …"`, `"reset …"` — useful when filtering a single path in output.
- **`assertNoChange` semantics differ per path.** Signup checks for absence of a new DB row; change and reset verify the *old* password still authenticates. This distinguishes "rejected before write" from "accepted but somehow no-op."
