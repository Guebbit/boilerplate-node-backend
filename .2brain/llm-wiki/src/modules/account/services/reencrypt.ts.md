---
source: src/modules/account/services/reencrypt.ts
sha256: 69cf4ca4c61e296ad5ed79ee3315092c278f1da33cda367056ab792136317dfb
generated_at: 2026-11-08T04:22:15.672973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reencrypt.ts

## Purpose

Encapsulates the re-encryption of every enrolled TOTP device secret onto the newest key in the `NODE_TOTP_ENCRYPTION_KEY` ring. Because the secrets physically live on the `users` document, this module only owns the *ring* and *binding rule*, then delegates the actual row walk to the users service. It exists so the ops script `reencrypt` (see `@infrastructure/security/reencrypt`) has a single, account-domain entry point to call.

## Key elements

- **`reencryptTotpSecrets(dryRun?: boolean)`** — The sole export. Passes the current encryption-key ring and the TOTP binding descriptor into `userService.reencryptTwoFactorSecrets`. When `dryRun` is `true`, the operation counts affected records without writing.

## Relationships

- **`src/modules/account/session/config.ts`** — Provides `getTotpEncryptionKeyRing()`, which resolves the ordered list of keys (newest first) used for re-encryption.
- **`src/modules/account/two-factor/totp.ts`** — Provides `totpBinding`, the descriptor that tells the users service *which* field on the user document holds the TOTP secret and how it is bound.
- **`src/modules/users/index.ts`** → **`src/modules/users/services/index.ts`** — Source of `userService.reencryptTwoFactorSecrets`, the function that actually iterates user documents and re-encrypts the secret in place.
- **`src/modules/account/services/index.ts`** — Barrel re-exports `reencryptTotpSecrets` for consumption by the module layer.
- **`src/modules/account/module.ts`** — Account-module registration; binds this service into the account module's DI/service graph.

## Notes

- This file performs **no** I/O itself. All persistence logic is delegated to the users service; keep it that way so the account module stays free of direct `users`-schema knowledge.
- The `dryRun` flag defaults to `false` (a real write). Ops scripts should pass `true` during a dry pass before a production run.
- The module doc comment references `@infrastructure/security/reencrypt` as the calling script — do not add a direct import there; the relationship is runtime/ops, not compile-time.
