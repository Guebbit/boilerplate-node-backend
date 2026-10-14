---
source: scenarios/rate-limits.ts
sha256: af7edf39d1aab8bdd29ba69d6267f17639f4df79633876765f9303b8f2bf1a5d
generated_at: 2026-10-14T07:00:26.142582+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Provides the elevated rate-limit environment variables that scripted drivers need when making hundreds of rapid requests from a single address. Without these budgets, the anti-automation ladder (designed for human browsers) would return 429s on whichever request happens to be next, making failures look like a bug rather than a throttle. Both consumers are local-only; this file is never meant for a real deployment.

## Key elements

- **`SCRIPTED_MAX`** (`'100000'`) — the value every budget is raised to. Set well above the test suites' own `1000` because `run-server.ts` accumulates counters across every spec in a single 60-second window.
- **`PRIVATE_COUNTERS`** — sets `NODE_RATE_LIMIT_REDIS_URL` to an empty string so counters live in process memory rather than the deployment's shared Redis. A blank value (not an unset one) is deliberate: it beats a `.env` file's Redis URL that a mere `delete` could not override.
- **`RAISED_RATE_LIMIT_ENV_VARS`** (exported) — the complete list of rate-limit env vars a scripted driver can trip, excluding `NODE_MFA_CHALLENGE_MAX` (sized to a live challenge's lifetime, not request volume).
- **`SCRIPTED_RATE_LIMITS`** (exported) — ready-to-spread `Record<string, string>` combining every variable in the list at `SCRIPTED_MAX` plus `PRIVATE_COUNTERS`.
- **`DEMO_BANK_TRANSFER`** (exported) — fictional beneficiary/IBAN so `GET /payments/methods` can offer the bank-transfer option the `shop` scenario's `order.awaitingTransfer` guarantee depends on. Only applied where the variable is unset, so a deployment's real values survive.

## Relationships

- **`scenarios/run-server.ts`** — primary consumer; one process serves the entire e2e suite end-to-end, so its in-memory counters accumulate across all specs. Spreads `SCRIPTED_RATE_LIMITS` into its environment before booting the app.
- **`scenarios/apply.ts`** — second consumer; builds the shop's history with several hundred requests. Gated by `isRelaxedEnvironment()`.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — asserts that `RAISED_RATE_LIMIT_ENV_VARS` stays exhaustive (i.e., any new rate-limit variable added to the app must also appear in this list).

## Notes

- **Exclusion is intentional:** `NODE_MFA_CHALLENGE_MAX` is deliberately absent from the list. If you add a new rate-limit variable, update both this array and the cross-cutting test.
- **Never merge into a deployment config.** Both callers enforce this independently (loopback bind + throwaway secrets in `run-server.ts`; `isRelaxedEnvironment()` gate in `apply.ts`).
- **Ordering matters in `SCRIPTED_RATE_LIMITS`:** `PRIVATE_COUNTERS` is spread *after* the mapped variables so the blank Redis URL wins over any accidental `NODE_RATE_LIMIT_REDIS_URL` entry.
- `DEMO_BANK_TRANSFER` values are fictional; a real deployment keeps its own by only being overwritten where the variable is unset.
