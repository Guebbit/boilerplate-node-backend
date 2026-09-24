---
source: src/modules/antibot/tests/contract/api.contract.test.ts
sha256: cac8e9369d8a224cee0fad065c7837bf915e39de354b0834c5fbf04a0f40cf1f
generated_at: 2026-09-23T18:23:10.014045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose

Contract tests for `GET /antibot/config` (valid response shape, provider/policy publication, error handling) plus a single end-to-end proof that a selected provider actually gates a guarded route (`POST /feedback/contact`). This suite lives in the `antibot` module rather than `feedback`'s own because `antibot` is the only module that knows both halves of the handshake—what the client is told to render and what counts as a valid token—without importing the routes it guards.

## Key elements

- **`setupTestDb()`** — one-time database bootstrap for the suite.
- **`ORIGINAL_PROVIDER` / `ORIGINAL_EMAIL_POLICY`** — snapshots of `NODE_ANTIBOT_PROVIDER` and `NODE_ANTIBOT_EMAIL_POLICY` taken at import time so `afterEach` can restore them (or delete them if they were unset).
- **`describe('GET /antibot/config')`** — five cases: default-off shape, provider + site-key publication, email-policy publication, unknown-provider → 500, unknown-policy → 500. Each asserts status, body fields, and `toSatisfyApiSpec()`.
- **`describe('the gate it guards, end to end…')`** — two cases against `POST /feedback/contact`: passes through (201) when provider is `none`, rejects with 401 when `turnstile` is selected and no token is supplied.
- **`CONTACT_PAYLOAD`** — fixed body used for the guarded-route cases.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — imported for side-effects; registers the `toSatisfyApiSpec()` matcher and any shared contract-test setup used by every `expect(...).toSatisfyApiSpec()` assertion.
- **`tests/support/http.ts`** (`@tests/http`) — provides the `api()` helper that builds a supertest-style client bound to the running server; every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — provides `setupTestDb()`, which creates an isolated test database before any test runs.

## Notes

- The file intentionally exercises `POST /feedback/contact` as the *only* guarded route. Adding a new guarded route does not require a parallel case here; the contract is "some route is gated," not "every route is gated."
- Unknown provider or policy values must return **500**, not silently fall back to `none`. This is a deliberate fail-fast contract—regressing it would hide misconfiguration in production.
- Env-var restoration in `afterEach` handles both "was previously set" and "was previously unset" (deletes the key) to avoid leaking state into other suites that run in the same process.
