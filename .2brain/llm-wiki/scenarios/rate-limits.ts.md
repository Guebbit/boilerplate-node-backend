---
source: scenarios/rate-limits.ts
source_sha256: bb4847ca65c9b4e59e3e5f92b3fe59efe7ac9f05a5ee8a6d019a246938531510
context_sha256: 6d6fc703778a7a769d7ab79ca43441f7b39426d6ef8010293d850ed40f8b827a
generated_at: 2026-11-22T01:45:08.984203+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/rate-limits.ts

## Purpose
Defines the environment-variable overrides that raise every rate-limit budget so a script (not a person) can drive the API from one address without being throttled. Without this, a 429 lands on whichever request happens to be next and looks like "login is broken". It is meant only for non-deployment contexts: the e2e server and the seeding script both refuse to run against a deployment.

## Key elements
- `SCRIPTED_RATE_LIMITS` (exported): a `Record<string, string>` that sets every variable in the internal `RAISED_RATE_LIMIT_ENV_VARS` list to `'100000'` (`SCRIPTED_MAX`). It also merges in `PRIVATE_COUNTERS`.
- `DEMO_BANK_TRANSFER` (exported): fictional `NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN` and `NODE_BANK_TRANSFER_BIC` values. They make `GET /payments/methods` offer bank transfer, which the `shop` scenario's `order.awaitingTransfer` guarantee needs.
- `RAISED_RATE_LIMIT_ENV_VARS` (internal): the list of limit variables. It covers the global, auth, signup, reset, submission, upload, payment (webhook, confirm, decline, intent), invoicing, order export and note, checkout, mail recipient, returns, example, cart merge, API key, password check and MFA send budgets.
- `PRIVATE_COUNTERS` (internal): sets `NODE_RATE_LIMIT_REDIS_URL` to `''` so counters are kept in memory.

## Relationships
- `scenarios/run-server.ts`: one of the callers. It serves the paired e2e suite from a single process whose counters accumulate across specs, which is why the budget is so high. It binds loopback with throwaway secrets.
- `scenarios/support/scripted-environment.ts`: a neighbor in the dependency graph. The file's own text does not name it, so the exact link is not visible here.

## Notes
- The list must cover every budget in the app. `tests/cross-cutting/rate-limit-budgets.test.ts` asserts this.
- `NODE_MFA_CHALLENGE_MAX` is deliberately left out. It is sized to a challenge's lifetime, not to request volume.
- The Redis URL is set to a blank string rather than left unset. A blank value set before dotenv runs beats the `.env` file's own URL, which an unset variable could not.
- Both callers apply the bank-transfer values only where nothing is already set, so a deployment's own `.env` values are kept.
- The extra payment confirm and decline entries exist because `shop-history.ts` runs a dozen `checkoutAndPay`s plus a declined card in one process.
- The file's header comment points to a security doc's "the rate-limit budgets" section for background.
