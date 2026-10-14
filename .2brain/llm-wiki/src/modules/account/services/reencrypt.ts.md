---
source: src/modules/account/services/reencrypt.ts
sha256: ec8d14cb6fa0996a5c66b4ab4065efa1fa16ec4c05d86466ccf12ebab8b98d52
generated_at: 2026-10-14T08:52:34.170544+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reencrypt.ts

## Purpose

Thin orchestration layer that re-encrypts every enrolled TOTP device secret onto the newest entry in the TOTP key ring. It exists to bind together the key-ring source (session config) and the binding rule (two-factor TOTP) into a single call to the users-module walker, so the ops script and the account services barrel both have one account-scoped entry point.

## Key elements

- **`reencryptTotpSecrets(dryRun?: boolean)`** – Exports a single function. Resolves the current key ring via `getTotpEncryptionKeyRing()` and the binding rule via `totpBinding`, then delegates to `reencryptTwoFactorSecrets` in the users module. `dryRun` (default `false`) causes the walk to count moves without writing.

## Relationships

- **`src/modules/account/session/config.ts`** — Provides `getTotpEncryptionKeyRing`, the ordered list of TOTP encryption keys (newest last).
- **`src/modules/account/two-factor/totp.ts`** — Provides `totpBinding`, the rule that maps a secret to the key slot it should occupy.
- **`src/modules/users/services/reencrypt.ts`** (via `src/modules/users/index.ts`) — Owns the actual database walk and write logic (`reencryptTwoFactorSecrets`); this file only supplies the ring and binding.
- **`scripts/ops/reencrypt.ts`** — The CLI/ops entry point that invokes `reencryptTotpSecrets` to trigger a live re-encryption run.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this function so consumers can import from the services namespace.
- **`tests/integration/scripts/reencrypt.test.ts`** — Integration test that exercises the end-to-end re-encryption flow through the ops script.

## Notes

- The walk happens on the `users` collection (not `account`), because TOTP secrets are stored on the user document. This module's role is purely to supply the account-scoped ring and binding rule; all I/O lives in the users module.
- The key ring is ordered with the **newest key last**; `reencryptTwoFactorSecrets` rewrites secrets to that last key. The ring is read at call time, so adding a new `NODE_TOTP_ENCRYPTION_KEY` value and restarting is sufficient to make the next run pick it up.
- `dryRun` is a boolean flag, not an options object; pass `true` to audit counts without mutation.
