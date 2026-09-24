---
source: tests/support/http.ts
sha256: c1f5cdf14f19112410b72dcbdb3552a5bd75f6e2f26a2e99bad035520c89c184
generated_at: 2026-09-23T20:11:35.917614+00:00
model: ollama:qwen3.8:27b
---

# tests/support/http.ts

## Purpose

HTTP-level test harness that drives the mounted Express app through its full request pipeline (routing, middleware, auth, serialization, error handling) via **supertest**. This is the only layer where a response can be compared against `openapi.yaml`, complementing the unit suites that call services and repositories directly.

## Key elements

- **`api()`** — Returns a fresh `supertest` agent bound to the app. Every HTTP call in a contract test starts here.
- **`AuthenticatedTestUser`** — Interface: `{ user, token, bearer }` where `bearer` is a template-literal-typed `` `Bearer ${string}` `` string ready to drop into an `Authorization` header.
- **`authenticateAs(role: 'admin' | 'user' = 'user')`** — Creates a verified user (or admin) via the users factories, then performs a real `POST /account/login` round-trip. Returns the `AuthenticatedTestUser`. Default profile is a verified **customer** (can checkout, pay, use the full app).
- **`authenticateAsRole(role: string)`** — Same login flow, but accepts any TENANT role name (`manager`, `warehouse`, `editor`, etc.). Uses a distinct `email`/`username` per role (`${role}@example.com`) to avoid duplicate-key collisions when a single test authenticates several roles.
- **`authenticateUser(user, role)`** _(internal)_ — Shared login round-trip: posts credentials to `/account/login`, asserts 200 + token presence, throws descriptive errors on failure.

## Relationships

- **`src/app.ts`** — Imports the fully mounted Express app. In `NODE_ENV === 'test'` the app skips auto-start (no HTTP server, no Mongo connection, no Redis, no queue), so importing here is side-effect-free.
- **All listed contract / integration test files** (account, antibot, api-keys, audit-logs, cart, delivery, feedback, inventory, locales, probes, identity-rate-limit, contact-identity-rate-limit) — Import `api`, `authenticateAs`, and/or `authenticateAsRole` as their sole HTTP entry point. They never construct supertest agents or hit `/account/login` themselves.
- **`@modules/users/tests/factories`** — Provides `createUser`, `createAdminUser`, and the shared `PLAIN_PASSWORD` constant used to seed accounts before the login call.

## Notes

- **Redis is genuinely optional in tests.** `getCacheValue` resolves `undefined` on any connection failure, which the app treats as a cache miss — no test needs a live Redis instance.
- **Tests that need an UNVERIFIED account** should build their own user with `createUser({}, 'unverified')` rather than reusing `authenticateAs`, which always sets `verifiedAt`.
- **`authenticateAsRole` must not be merged into `authenticateAs`.** It exists for contract sweeps that drive every preset role through the HTTP surface in a single test; the distinct email/username per role prevents duplicate-key errors that a shared default address would cause.
- **Login goes through the real endpoint**, not a hand-signed JWT. If the login route stops issuing usable tokens, every contract test that depends on auth fails immediately.
