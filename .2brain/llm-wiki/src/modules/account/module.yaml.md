---
source: src/modules/account/module.yaml
sha256: 234e911b377338ba902ff834046c90a792ccb694aed5c667d545e425a669efc1
generated_at: 2026-10-29T02:36:13.131844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.yaml

## Purpose
Module declaration for the account domain (signup, login, sessions, 2FA, OAuth, account lifecycle). It declares the module's dependencies, its full set of rate-limit budgets with their bounds and audit flags, and the scheduled background jobs that drive account lifecycle transitions (inactivity, email change, exports, deletions). It is the single source of truth for "what the account module owns" so that `module.ts` and the rate-limit enforcement layer can be generated or validated against it.

## Key elements

- **`summary` / `subdomain` / `group`** — metadata identifying this as a `foundation`-group, `generic`-subdomain module.
- **`dependsOn`** — declares hard dependencies on `access` (role helpers) and `users` (the shared User document).
- **`rateLimits`** — ~18 named budgets, each with a `namespace`, `environmentVariable`, `defaultMax`, `windowMs`, and a `bounds` description. Key clusters:
  - *Mail* — `mailRecipient` (10/day, victim-side budget).
  - *Credential guesses* — five tiers by key: `credentialsIdentity` (per account, 10/15 min), `credentialsDevice` (forged cookie, 10/15 min), `credentialsAddress` (per IP, 30/15 min), `credentialsBlock` (per /24-equivalent, 100/15 min), `credentialsSession` (per signed-in session, 10/15 min). All use a 15-minute window; lockouts escalate on repeat.
  - *Password checks* — `passwordCheck` and `passwordCheckBlock`, shared window, sized for debounced typing.
  - *Signup / Reset* — three tiers each (identity, address, block), all **spent by success** because the endpoints always return 200 to prevent enumeration.
  - *MFA* — `mfaChallenge` (per live challenge), `mfaSend` (per login challenge), `mfaAccountSend` (per signed-in account, 1-hour window).
- **`jobs`** — four cron-scheduled tasks: `reapInactiveAccounts` (02:05), `reapPreviousEmails` (02:07), `reapAccountExports` (02:09), `reapScheduledDeletions` (every hour at :13).

## Relationships

- **`src/modules/account/module.ts`** — the executable counterpart; this YAML is its declarative contract. `module.ts` reads the rate-limit names, environment variables, and job schedules defined here.
- **`src/modules/addresses/module.ts`** — the `credentialsAddress`, `credentialsBlock`, `signupAddress`, `resetAddress`, and `passwordCheckBlock` budgets key on address identity provided by the addresses module.
- **`src/modules/wishlist/module.ts`** — shares the `foundation` group and the `users` dependency; account lifecycle events (deletion, export) can cascade into wishlist data.
- **`tests/audit/compliance-rules.yaml`** — validates that every budget marked `audited: true` here satisfies the compliance rules (e.g., window must not expire before the challenge it bounds, escalation factor bounds).

## Notes

- Every rate-limit budget is `audited: true`; the `bounds` field is both documentation and the basis for audit-rule assertions in the compliance test suite.
- Credential budgets deliberately use a **15-minute** window (not the shared 1-minute browsing window) so a budget that refills every minute "bounds nothing."
- Signup and reset budgets are spent on **success**, not failure, because those endpoints always return 200 to prevent account enumeration.
- MFA challenge/send budgets bucket on the **longer** of the two challenge TTLs (`MFA_CHALLENGE_DELIVERED_TTL_MS`); a window must never end before the challenge it protects.
- The `credentialsIdentity` budget is skipped when the browser presents a valid familiar-device cookie, so a legitimate user spending their budget cannot lock themselves out.
- Job schedules are all in UTC and intentionally staggered (02:05, 02:07, 02:09, hourly) to avoid overlapping DB load.
