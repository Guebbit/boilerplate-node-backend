---
source: src/modules/account/two-factor/lockout.ts
source_sha256: 7bd903b71239d6a1e0b9ae6b7a42c10418572d04c1bf7b0bee17d2e7455c7aa5
context_sha256: a3cf1ac58861b0b67c6f525f7e9d277172084a4f42d1efa738771b9052f649bf
generated_at: 2026-11-22T04:11:07.993440+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/lockout.ts

## Purpose
Defines the per-account wrong-code policy for two-factor authentication. The `users` module stores the failure counter. This file supplies the thresholds: how many wrong codes lock an account, and for how long. Per the file's doc comment, `account` owns that decision and passes the values to the users door on every reservation.

## Key elements
- `MFA_MAX_FAILURES` (`number`): the number of wrong codes an account may have reserved against its armed 2FA before it locks. It comes from `twoFactorRules.lockout.maxFailures`. The doc comment says NIST SP 800-63B allows at most 100, and that ten is what a person mistyping can plausibly reach.
- `MFA_LOCK_MS` (`number`): how long the lock lasts, in milliseconds, once `MFA_MAX_FAILURES` is reached. It comes from `twoFactorRules.lockout.lockMs`.

## Relationships
- Its only graph neighbor is `src/modules/account/two-factor/index.ts`, which sits in the same module. The file itself shows no code linking the two, so check `index.ts` for how these constants are used.

## Notes
- The file has no logic of its own. It only exposes typed constants taken from generated rules (`twoFactorRules`, imported from `../rules.generated`; the doc comments say the values come from `rules.yaml`), so change the values in `rules.yaml` rather than here.
- The file does not enforce the lockout. It only supplies the thresholds, and the counter lives in `users`.
