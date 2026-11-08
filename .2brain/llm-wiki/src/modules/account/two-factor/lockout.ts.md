---
source: src/modules/account/two-factor/lockout.ts
sha256: 7bd903b71239d6a1e0b9ae6b7a42c10418572d04c1bf7b0bee17d2e7455c7aa5
generated_at: 2026-11-08T04:52:21.160507+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/lockout.ts

## Purpose

Defines the per-account 2FA lockout policy: how many consecutive wrong codes are tolerated and how long the resulting lock persists. The actual thresholds are not hard-coded here; they are sourced from a generated rules file so that operators can tune them via `rules.yaml`.

## Key elements

- **`MFA_MAX_FAILURES`** (`number`) — Maximum wrong-code attempts an account may make against its armed 2FA before it is locked out. Sourced from `twoFactorRules.lockout.maxFailures`. The doc note cites NIST SP 800-63B (cap of 100) and states the chosen value (10) is meant to be reachable by a person mistyping.
- **`MFA_LOCK_MS`** (`number`) — Duration of the lock, in milliseconds, once `MFA_MAX_FAILURES` is reached. Sourced from `twoFactorRules.lockout.lockMs`.

## Relationships

- **`src/modules/account/two-factor/index.ts`** — Sits in the same module directory and is the module entry point. The lockout doc comment states the thresholds are "handed to the users door on every reservation," indicating the account/two-factor barrel (index) re-exports these constants so the broader account reservation flow can enforce the policy.
- **`../rules.generated`** — Import source for both constants; the true single source of truth is the upstream `rules.yaml`, compiled into this generated module.

## Notes

- Both values are **read from a generated file** (`rules.generated`), not hard-coded. To change the lockout threshold, edit `rules.yaml` and regenerate — do not overwrite the constants here.
- The module is intentionally value-only (two exported `const`s). It performs no logic and has no side effects, so it is safe to import anywhere without triggering registration or initialization code.
