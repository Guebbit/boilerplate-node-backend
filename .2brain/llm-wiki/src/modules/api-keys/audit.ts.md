---
source: src/modules/api-keys/audit.ts
source_sha256: 0729239a5a13fe46d665962322db37a3a0b91d869b922ad29259cc5805e4274b
context_sha256: 7d0c7a9c3f5c10bf90c423e801509c3de80e24749c3183feb7c1edf48e7f7c07
generated_at: 2026-11-22T04:20:16.262686+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/audit.ts

## Purpose
Declares the audit actions emitted by the API keys module and registers them into the app-wide audit action type. Minting and revoking a credential are writes that data-protection or incident questions are likely to ask about later, so both are audited.

## Key elements
- `apiKeysAuditActions`: a `const` object holding the module's audit action strings:
  - `ADMIN_API_KEY_MINTED` = `'admin.api_key.minted'`
  - `ADMIN_API_KEY_REVOKED` = `'admin.api_key.revoked'`
  - `SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE` = `'system.api_keys.revoked_on_compromise'`. It covers the case where every credential a person minted was revoked because their account may be compromised.
- Module augmentation of `@infrastructure/observability/audit`: adds an `apiKeys` entry to `AuditActionMap`. Its type is the union of the values of `apiKeysAuditActions`.

## Relationships
- `src/modules/api-keys/services/api-keys.ts` is the likely consumer that emits these actions when keys are minted or revoked. This is inferred from the action names, because the file itself has no imports or references.
- `src/modules/api-keys/tests/integration/outcomes.test.ts` is a neighbor in the dependency graph. The file's content doesn't show how it uses these actions.

## Notes
- The actions are registered by declaration merging (augmentation), not by editing a central list. The header comment points to `src/modules/account/audit.ts` for the reasoning.
- The `as const` object means the action strings are literal types, which is what the `AuditActionMap` union relies on.
- The `admin.*` and `system.*` prefixes separate actions triggered by an admin from those triggered by the system. The system action is the bulk revoke on suspected compromise.
