---
source: src/modules/account/services/reencrypt.ts
sha256: 69cf4ca4c61e296ad5ed79ee3315092c278f1da33cda367056ab792136317dfb
generated_at: 2026-10-29T02:44:06.462959+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reencrypt.ts

## Purpose

Provides the account-domain entry point for re-encrypting all enrolled TOTP secrets onto the newest key in the TOTP encryption key ring. The actual walk over `users` documents is performed by the users service; this file assembles the key ring and binding rule and delegates. Intended to be invoked by the ops script `reencrypt` (see `@infrastructure/security/reencrypt`).

## Key elements

- **`reencryptTotpSecrets(dryRun = false)`** – Sole export. Passes `{ ring, bindingOf }` to `userService.reencryptTwoFactorSecrets`. When `dryRun` is `true`, the users service counts what would be moved and writes nothing.

## Relationships

- **`../session/config`** (`getTotpEncryptionKeyRing`) – supplies the ordered key ring that defines "newest key" and the re-encryption target.
- **`../two-factor/totp`** (`totpBinding`) – supplies the binding rule (which field / sub-document the TOTP secret lives on the user record).
- **`@modules/users`** (`userService`) – executes the actual per-user re-encryption walk; this file never touches the DB directly.
- **`src/modules/account/services/index.ts`** – barrel that re-exports this function for consumers within the account module.
- **`src/modules/account/module.ts`** – account module registration; makes the reencrypt service part of the module's public surface.
- **`src/modules/users/services/index.ts`** – where `reencryptTwoFactorSecrets` is defined and exported to `userService`.

## Notes

- This file owns the *policy* (which ring, which binding) but not the *mechanics* (iteration, writes). If the binding rule or ring source changes, edit here, not in the users service.
- `dryRun` defaults to `false`; the ops script is responsible for passing `true` when it wants a dry-run count.
