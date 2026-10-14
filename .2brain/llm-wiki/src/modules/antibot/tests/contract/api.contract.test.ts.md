---
source: src/modules/antibot/tests/contract/api.contract.test.ts
sha256: 8eb54584179dcbe54db1299d1edc20d7e78b6872d1c1480e43fff88d7976495d
generated_at: 2026-10-14T14:57:16.459949+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/antibot/challenge` and `/antibot/config` endpoints, verifying they respond correctly under different provider and email-policy configurations. Also contains the end-to-end proof that a selected provider actually gates a real guarded route (`POST /feedback/contact`) with a 401 when no token is present. The e2e portion lives here (not in `feedback`'s own suite) because `antibot` is the only module that understands both sides of the handshake—what the client is told to render and what counts as a valid token—without importing the routes it guards.

## Key elements

- **`describe('GET /antibot/challenge')`** — Verifies the endpoint returns 200 for a self-hosted provider (`altcha`), and 404 when no provider is set (default) or when a vendor-hosted provider (`turnstile`) is selected (vendor issues its own challenges).
- **`describe('GET /antibot/config')`** — Verifies the published config shape: default (provider `none`, empty parameters, rungs `identityBudgets: true`, `emailPolicy: 'off'`), provider + site-key publication, email-policy rung reporting, and 500 responses for unknown provider/policy values rather than a silent fallback.
- **`describe('the gate it guards, end to end…')`** — Posts a fixed `CONTACT_PAYLOAD` to `/feedback/contact`; expects 201 with no provider, 401 with `turnstile` selected and no token.
- **`setupTestDb()`** — Called once at module scope to prepare the test database.
- **`setEnvironment`** calls — Each test sets `NODE_ANTIBOT_PROVIDER`, `NODE_ANTIBOT_ALTCHA_SECRET`, `NODE_ANTIBOT_EMAIL_POLICY`, or `NODE_ANTIBOT_TURNSTILE_SITE_KEY` to isolate the configuration under test.

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect (`import '@tests/contract'`); sets up global contract-test infrastructure (likely shared matchers or harness).
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, invoked at the top of the file to create an isolated database for the suite.
- **`tests/support/http.ts`** — Provides the `api()` helper used to issue all HTTP requests against the application under test.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, which sets (and presumably restores) environment variables so each test controls provider/policy state independently.

## Notes

- "Rungs" refer to anti-bot layers: rung 2 = email policy, rung 3 = provider. `GET /antibot/config` reports both, which is why both env vars are set in the config tests.
- The file intentionally asserts **500** (not 400/fallback) when an unknown provider or policy value is configured—the contract is "fail loudly, never silently degrade."
- Comments in the source mark places where state is expected to be restored for other suites ("Saved so…"), but no explicit cleanup code is visible; isolation is delegated to the test framework / `setEnvironment` contract.
