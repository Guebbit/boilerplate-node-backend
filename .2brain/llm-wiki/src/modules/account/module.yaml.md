---
source: src/modules/account/module.yaml
sha256: 86929f4500dff558325047aea6b6be79141c63c1ce88d5c3679749c0e7c133b8
generated_at: 2026-11-14T18:38:09.921148+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.yaml

## Purpose

Module manifest for the **account** subdomain (group `foundation`). It declares the module's dependencies, its full set of rate-limit budgets, and its scheduled jobs. Everything an operator or the runtime needs to understand what the account module *is*, what it *depends on*, and what it *enforces* lives here.

## Key elements

- **`summary` / `subdomain` / `group`** — Identifies the module as the "who is making this request" layer (signup, login, sessions, 2FA, OAuth, account lifecycle) under the `foundation` group.
- **`dependsOn`** — Declares hard dependencies on `access` (roles, promotion) and `users` (the shared `User` document).
- **`rateLimits`** — The bulk of the file. Each entry defines a named budget (`name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs`) plus a `bounds` description of *what attack it defeats* and *who it protects*. Key groups:
  - **Mail** (`mailRecipient`) — per-mailbox daily cap; bounds the victim, not the sender.
  - **Credential guesses** — layered budgets per identity, device cookie, address, address block, and signed-in account. All 15-minute windows; lockouts escalate (×2 per repeat, max ×8). A familiar-device cookie exempts the owner from the per-account budget.
  - **Password-strength checks** — debounced-keystroke sized, per-address and per-block.
  - **Signup / reset** — spent on *success* (no account key exists yet); per-identity, per-address, per-block tiers.
  - **MFA** — `mfaChallenge` and `mfaSend` (10-min window pinned to `MFA_CHALLENGE_DELIVERED_TTL_MS`); `mfaAccountSend` (1-hour window for signed-in deliveries).
  - All budgets are `audited: true`.
- **`jobs`** — Four scheduled tasks (all run 02:00–02:13 server time, except the hourly deletion sweep):
  - `reapInactiveAccounts` (02:05) — minimise / warn / soft-delete / hard-delete inactive accounts.
  - `reapPreviousEmails` (02:07) — purge lapsed previous-email undo links.
  - `reapAccountExports` (02:09) — delete expired data-export files and rows.
  - `reapScheduledDeletions` (every hour :13) — cascade-delete accounts past their grace period, send goodbye mail.

## Relationships

- **`shared/rules/rate-limits.yaml`** — Defines the shared rate-limit conventions this file references: the `shared` window value that several budgets resolve to, and the escalation/lockout semantics applied to the credential-guess budgets.
- **`src/modules/account/asyncapi.internal.yaml`** — The internal API contract for the routes these budgets protect (login, 2FA send, password reset, signup, etc.). The `bounds` text in this file cites those route paths.
- **`src/modules/account/module.ts`** — The TypeScript entry point that reads this manifest at module-load time to register dependencies, wire rate limiters, and schedule the `jobs` listed here.

## Notes

- `windowMs: shared` is **not** a literal millisecond count; it resolves to the shared browsing window defined in `shared/rules/rate-limits.yaml` (1 minute by default). Credential-guess budgets deliberately override this with an explicit `900000` (15 min) because a per-minute window "bounds nothing."
- MFA challenge/send budgets are pinned to `MFA_CHALLENGE_DELIVERED_TTL_MS` (the longer of two challenge tiers) so the window never expires before the challenge it protects. A test in `rate-limits.test.ts` enforces this.
- Signup and reset budgets are *spent by success*, not failure, because those endpoints return 204 regardless to prevent account enumeration.
- `credentialsSignedIn` is keyed on the **account**, not the address: a stolen session that exhausts it locks out the owner's other sessions until the window ends. A fresh sign-in or password reset clears all sessions.
- The `bounds` fields are normative design rationale, not just comments — they explain *why* each budget is sized as it is and what attack vector it targets.
