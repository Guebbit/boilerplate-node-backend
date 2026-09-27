---
source: src/modules/antibot/tests/contract/api.contract.test.ts
sha256: 158619d2550d01f427eb42da96237a32c1c334fe428438909de477b87bdc300b
generated_at: 2026-09-27T14:40:37.473082+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the two public `/antibot` endpoints (`/challenge`, `/config`) and an end-to-end proof that a selected provider actually gates a real guarded route (`/feedback/contact`). This file lives in the antibot module rather than the feedback module because antibot is the only place that understands both halves of the handshake—what the client is told to render and what counts as a valid token—without importing the routes it guards.

## Key elements

- **`setupTestDb()`** – called at module top-level to give each test an isolated database.
- **Env-var save/restore (`ORIGINAL_PROVIDER`, `ORIGINAL_EMAIL_POLICY`, `ORIGINAL_ALTCHA_SECRET`)** – captured before tests run and restored in `afterEach` so other suites see their own configuration.
- **`describe('GET /antibot/challenge')`** – asserts 200 + valid contract for a self-hosted (altcha) provider, 404 when no provider is set (default), and 404 for a vendor-hosted provider (turnstile) that issues its own challenges.
- **`describe('GET /antibot/config')`** – asserts the shape of the published config (provider name, public parameters, rung postures) and that unknown provider/policy values fail closed with 500 instead of silently defaulting.
- **`describe('the gate it guards, end to end on one guarded route')`** – POSTs a fixed `CONTACT_PAYLOAD` to `/feedback/contact` and verifies 201 with no provider selected vs. 401 with a provider active but no token supplied.
- **`toSatisfyApiSpec()`** – a custom matcher (from the contract support module) that validates status, headers, and body shape against the shared API contract for every assertion.

## Relationships

- **`tests/support/contract.ts`** – imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher and any global contract-test setup that all contract suites rely on.
- **`tests/support/http.ts`** – imported as `@tests/http`; supplies the `api()` helper used to issue requests against the running server under test.
- **`tests/support/setup-test-db.ts`** – imported as `@tests/setup-test-db`; provides `setupTestDb()` to create/tear down an isolated database per test run.

## Notes

- Env vars are the sole configuration surface for these tests; there is no DI or config-object injection. Always restore them in `afterEach` (including deleting the key if it was absent) to avoid cross-suite leakage.
- The file intentionally exercises `/feedback/contact`, a route owned by a different module. This is deliberate: it proves the gate works end-to-end without duplicating the handshake knowledge that only antibot holds.
- 404 from `/antibot/challenge` for vendor-hosted providers (e.g. turnstile) is the *expected* response, not an error—those providers issue challenges from their own CDN.
- Unknown provider or policy names are a 500 by design (fail-closed); the tests assert this rather than a 404 or fallback, so a regression to "just default to none" will be caught here.
