---
source: src/modules/account/services/reencrypt.ts
sha256: 7e891e661e33ad5f367f7a91ab2cf7cc3e15b3ca5c15dd6dc1480c524f23d9ce
generated_at: 2026-11-14T18:50:36.973875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reencrypt.ts

## Purpose
Provides the account-module entry point for re-encrypting all enrolled TOTP device secrets onto the newest key in the TOTP encryption key ring. It exists so the ops script (`@infrastructure/security/reencrypt`) can invoke a single, dry-run-capable call that delegates the actual document walk to the users service while the account module supplies the ring and binding rule.

## Key elements
- **`reencryptTotpSecrets(dryRun?)`** — the sole export. Calls `accountUserService.reencryptTwoFactorSecrets` with the TOTP key ring and the `totpBinding` binding rule. The `dryRun` parameter (defaults to `false`) controls whether the operation only counts what a real run would move and writes nothing.

## Relationships
- **`src/modules/users/friends/account.ts`** — provides `accountUserService`, whose `reencryptTwoFactorSecrets` method performs the actual `users`-document walk and key rotation.
- **`src/modules/account/session/config.ts`** — provides `getTotpEncryptionKeyRing()`, the ordered list of TOTP encryption keys.
- **`src/modules/account/two-factor/totp.ts`** — provides `totpBinding`, the binding rule that identifies which field on the user document holds the TOTP secret.
- **`src/modules/account/services/index.ts`** — barrel file that re-exports this module for consumers of the account services surface.

## Notes
- The TOTP secrets live on the **`users`** document, not an account-specific collection; the walk is therefore owned by `accountUserService`, not by any account-local repo.
- This module is deliberately thin: it composes the ring + binding from the account domain and hands them to the users service. All encryption/decryption logic resides in the users module.
- Intended to be called by an ops script, not from request-handling code. The `dryRun` flag exists specifically for safe preview in that context.
