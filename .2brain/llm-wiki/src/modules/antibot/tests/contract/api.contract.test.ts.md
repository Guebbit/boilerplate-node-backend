---
source: src/modules/antibot/tests/contract/api.contract.test.ts
source_sha256: 00237613ef2322574007b84cf5bae534549bfbda697830e60937781468357e55
context_sha256: e8a5927b554017039a0c9543309899c551e3b857c7a71268f7b189be35ca6911
generated_at: 2026-11-22T04:20:01.819647+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/antibot` routes. It also holds the end-to-end check that selecting a provider actually gates a guarded route (`POST /tasks`). The header comment explains why this lives in `antibot` and not in `tasks`'s suite. `antibot` knows both sides of the handshake, what the client is told to render and what counts as a token, and it does so without importing the routes it guards. `GET /config` has its own contract test in `tests/contract/config.contract.test.ts`.

## Key elements
- `describe('GET /antibot/challenge')` has three cases:
  - With `NODE_ANTIBOT_PROVIDER=altcha` and `NODE_ANTIBOT_ALTCHA_SECRET` set, it expects `200`.
  - With the provider unset (the default), it expects `404`.
  - With `turnstile`, a vendor-hosted provider that issues its own challenges, it expects `404`.
- `describe('the gate it guards, end to end on one guarded route')` uses a `CONTACT_PAYLOAD` (email, subject, message) posted to `/tasks`:
  - With the provider unset (`none`), it expects `202`.
  - With `turnstile` selected and no token sent, it expects `403`.
- `setupTestDb()` is called once at module level.

## Relationships
- `@tests/contract` is imported for its side effects only, and it is not in the neighbor list.
- `tests/support/setup-test-db.ts` supplies `setupTestDb`, which prepares the test database.
- `tests/support/http.ts` supplies `api()`, the HTTP client used for the `.get` and `.post` calls.
- `tests/support/environment.ts` supplies `setEnvironment`, which switches `NODE_ANTIBOT_PROVIDER` and `NODE_ANTIBOT_ALTCHA_SECRET` per test.
- `tests/support/contract.ts` corresponds to the `@tests/contract` import above.

## Notes
- The tests assert status codes only. The altcha case does not check the challenge body, despite its title ("matches the contract").
- A JSDoc comment says the environment is "saved so the self-hosted provider's secret does not leak into other suites". No save or restore code appears in this file, so any restoration must come from the support helpers.
- Setting a variable to `undefined` through `setEnvironment` stands in for "provider not selected".
