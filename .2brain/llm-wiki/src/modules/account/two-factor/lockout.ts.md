---
source: src/modules/account/two-factor/lockout.ts
sha256: 7bd903b71239d6a1e0b9ae6b7a42c10418572d04c1bf7b0bee17d2e7455c7aa5
generated_at: 2026-10-29T03:07:05.818677+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/lockout.ts

## Purpose

Exports the two constants that define the per-account wrong-code lockout policy for armed 2FA: how many consecutive failures are allowed and how long the resulting lock lasts. The actual enforcement (storing the counter, applying the lock) lives elsewhere (`users`); this file only supplies the policy numbers.

## Key elements

- **`MFA_MAX_FAILURES: number`** — Max wrong-code attempts before the account's 2FA locks. Sourced from `twoFactorRules.lockout.maxFailures`. Comment notes NIST SP 800-63B caps this at 100; the chosen value (10) is meant to cover plausible mistyping.
- **`MFA_LOCK_MS: number`** — Duration of the lock (in milliseconds) once `MFA_MAX_FAILURES` is reached. Sourced from `twoFactorRules.lockout.lockMs`.

## Relationships

- **`src/modules/account/rules.generated.ts`** — Import source. Provides the `twoFactorRules` object (generated from `rules.yaml`) from which both constants are read at module-load time.
- **`src/modules/account/two-factor/index.ts`** — Barrel file for the `two-factor` directory; re-exports these two constants so consumers can import them from the package entry point rather than this file directly.

## Notes

- Values are not hardcoded here; they are pulled from the generated rules module, which in turn is generated from `rules.yaml`. Changing the policy means editing `rules.yaml` and regenerating, not touching this file.
- The module doc comment references a "users door" and "every reservation" as the enforcement sites, but neither is defined or imported in this file—treat those as pointers to other modules, not as APIs exposed here.
