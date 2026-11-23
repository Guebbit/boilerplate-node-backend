---
source: src/modules/account/services/reencrypt.ts
source_sha256: 7e891e661e33ad5f367f7a91ab2cf7cc3e15b3ca5c15dd6dc1480c524f23d9ce
context_sha256: 251948911e2e22706b38585b6a7ec9a5c5bfb5d32e62094b9a5da45525c6e8f1
generated_at: 2026-11-22T03:41:10.337846+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/reencrypt.ts

## Purpose
Provides the account module's entry point for re-encrypting every enrolled TOTP device secret onto the newest `NODE_TOTP_ENCRYPTION_KEY`. The secrets live on the `users` document, so the walk itself is done by the users module. This file supplies the key ring and the binding rule. It is run by the ops script `reencrypt` (see `@infrastructure/security/reencrypt`).

## Key elements
- `reencryptTotpSecrets(dryRun = false)`: the only export. It delegates to `accountUserService.reencryptTwoFactorSecrets({ ring, bindingOf }, dryRun)`. With `dryRun` set, it counts what a real run would move and writes nothing.

## Relationships
- `src/modules/users/friends/account.ts`: provides `accountUserService`. Its `reencryptTwoFactorSecrets` method does the actual iteration over `users`.
- `src/modules/account/session/config.ts`: provides `getTotpEncryptionKeyRing()`, the key ring passed as `ring`.
- `src/modules/account/two-factor/totp.ts`: provides `totpBinding`, passed as `bindingOf`.
- `src/modules/account/services/index.ts` and `src/modules/account/module.ts`: listed as graph neighbors. The file content shows no direct interaction with either.

## Notes
- This module owns the ring and the binding rule, while the users module owns the traversal.
- The key ring is read when the function is called, because `getTotpEncryptionKeyRing()` is invoked inside it.
- The function returns whatever `reencryptTwoFactorSecrets` returns. The shape of that result isn't visible in this file.
