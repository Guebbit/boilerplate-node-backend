---
source: src/modules/account/module.yaml
sha256: 234e911b377338ba902ff834046c90a792ccb694aed5c667d545e425a669efc1
generated_at: 2026-11-08T04:11:42.105627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.yaml

## Purpose

Module descriptor for the **account** subdomain (signup, login, sessions, 2FA, OAuth, account lifecycle). Declares the module's identity, kernel dependencies, every rate-limit budget the module enforces, and the scheduled maintenance jobs it runs. Consumed by the runtime to wire up limiters and cron; also serves as the canonical, human-readable source of *why* each budget exists.

## Key elements

- **`summary` / `subdomain` / `group` / `dependsOn`** — Module metadata. Depends on `access` (role helpers) and `users` (the shared `User` document).
- **`rateLimits`** — 17 named budgets, each with `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs`, `bounds` (prose rationale), and `audited: true`. Covers:
  - **Mail recipient** (`mail-recipient`) — per-mailbox daily cap (10/day).
  - **Credential guessing** — five tiers: per account, per forged device cookie, per address, per address block, per signed-in session. All use a 15-minute window (900 000 ms) so the budget doesn't refill every minute.
  - **Password-strength checks** — per caller and per address block, using the shared window.
  - **Signup** — per email / address / block, spent by *success* (no account to key a failure on yet).
  - **Password reset** — per email / address / block, also spent by success (`postResetRequest` always returns 200 to prevent enumeration).
  - **MFA challenge** — guesses against one live challenge (5/10 min) and deliveries against one challenge (3/10 min).
  - **MFA account send** — deliveries to a signed-in account (5/hour).
- **`jobs`** — Four scheduled tasks with cron expressions and summaries:
  - `reapInactiveAccounts` (02:05 daily) — minimise / warn / soft-delete / hard-delete inactive accounts.
  - `reapPreviousEmails` (02:07 daily) — forget lapsed previous-email records.
  - `reapAccountExports` (02:09 daily) — purge expired data-export artefacts.
  - `reapScheduledDeletions` (every hour :13) — cascade-erase accounts past their deletion grace period.

## Relationships

- **`shared/rules/rate-limits.yaml`** — Several budgets use `windowMs: shared`, meaning they inherit a common window value defined there rather than hard-coding one. The escalation/doubling logic referenced in the `credentialsIdentity` bounds comment also lives in `rate-limits.ts` (same shared package).
- **`src/modules/account/asyncapi.internal.yaml`** — The `bounds` text names internal endpoints that this spec defines (e.g. `POST /account/login/2fa`, `POST /account/2fa/methods/{method}/send`), tying each budget to the concrete route it protects.
- **`src/modules/account/module.ts`** — The TypeScript implementation that reads this YAML to register limiters, expose the `dependsOn` helpers, and schedule the four jobs at runtime.

## Notes

- `windowMs: shared` is a sentinel, not a millisecond value; the actual number comes from the shared rules file. Mixing it with explicit numbers (900 000, 86 400 000, 600 000, 3 600 000) in the same `rateLimits` map is intentional.
- Signup and reset budgets are **spent by success**, not failure, because those endpoints always return 200 to prevent account enumeration. This inverts the usual "count failures" assumption.
- The `bounds` field is descriptive prose for operators and AI assistants; it is **not** parsed or enforced at runtime. Enforcement is purely `defaultMax` + `windowMs` + `namespace`.
- MFA challenge windows are deliberately pinned to the longer challenge TTL (`MFA_CHALLENGE_DELIVERED_TTL_MS`) so a window can never expire before the challenge it bounds (enforced by `rate-limits.test.ts`).
- All `environmentVariable` names use the `NODE_` prefix and are the override point for operators; `defaultMax` is the fallback.
