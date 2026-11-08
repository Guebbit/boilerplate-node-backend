---
source: tests/contract/config.contract.test.ts
sha256: 7f35785eda197cfd2c2eadcb182f4d2d93a881d8f02ebf1903ba87a1380aae03
generated_at: 2026-11-08T09:18:59.320506+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/config.contract.test.ts

## Purpose

Contract tests for the `GET /config` endpoint. Pins the public response shape (session config, OAuth providers, antibot/human-challenge settings, operator identity, and Terms version) to guarantee all pieces arrive together, require no credential, and carry a short public cache header. Exists to catch regressions where a field silently disappears, changes type, or gains an unintended dependency on request-specific state.

## Key elements

- **`describe('GET /config')`** — the sole test suite; every case calls `api().get('/config')` and asserts on `response.body`, `response.status`, or `response.headers`.
- **Default-shape test** — asserts `antibot` (`provider: 'none'`, `rungs`), `session.mode` + `session.lifetimeSeconds` (three numeric tiers), and `oauthProviders` is an array.
- **Support email / operator / Terms tests** — verify `supportEmail`, `operator` (legal name, address, phone), and `termsVersion` surface from env vars.
- **Optional operator fields test** — confirms `phone` and `vatNumber` are absent (not null) when their env vars are unset.
- **OAuth provider listing test** — registers `fakeOAuthProvider` via `registerOAuthProvider('fake', …)` and asserts it appears in `oauthProviders`.
- **Antibot provider & parameters test** — sets `NODE_ANTIBOT_PROVIDER` / `NODE_ANTIBOT_TURNSTILE_SITE_KEY` and checks `antibot.provider` + `antibot.parameters.siteKey`.
- **Email-policy rung test** — sets `NODE_ANTIBOT_EMAIL_POLICY: 'mx'` and checks `antibot.rungs.emailPolicy`.
- **Cache-header test** — asserts `cache-control: public, max-age=60`.
- **Error-path tests** — unknown `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` yield **500** with `cache-control: no-store` (no silent fallback).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as a side-effect (`@tests/contract`) to install contract-test globals/conventions before the suite runs. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the database fixture once at module scope. |
| `tests/support/http.ts` | `api()` builds the HTTP client used in every request. |
| `tests/support/environment.ts` | `setEnvironment()` swaps env vars per test (e.g. `NODE_ANTIBOT_PROVIDER`, `NODE_SUPPORT_EMAIL`) so each case controls its own config. |
| `src/modules/account/oauth/providers/index.ts` | `registerOAuthProvider()` is called to inject a test provider so the listing assertion can verify it. |
| `scenarios/support/doubles/oauth-fake.ts` | `fakeOAuthProvider` is the concrete double passed to `registerOAuthProvider`. |

## Notes

- The operator default values (legal name, address, phone) are seeded by a separate `tests/support/setup-environment.ts` file, not by this test file itself — the test only asserts what it expects to be present.
- Error cases are intentionally **500 + `no-store`**: the endpoint must not silently degrade to a default antibot config when an operator has configured a provider name that is not registered.
- `setEnvironment` is called with `undefined` (not deleted) to simulate "unset" for `NODE_ANTIBOT_PROVIDER` / `NODE_ANTIBOT_EMAIL_POLICY` in the default-shape test; this is the convention for clearing env in this test suite.
- The file uses `expect.any(Number)` and `expect.any(String)` for fields whose exact value is implementation-defined (session lifetimes, operator email) — only the *type and presence* are pinned.
