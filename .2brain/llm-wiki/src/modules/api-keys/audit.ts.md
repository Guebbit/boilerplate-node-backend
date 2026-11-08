---
source: src/modules/api-keys/audit.ts
sha256: 0729239a5a13fe46d665962322db37a3a0b91d869b922ad29259cc5805e4274b
generated_at: 2026-11-08T05:01:16.206483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/audit.ts

## Purpose

Declares the audit-action vocabulary for API-key lifecycle events (mint, revoke, compromise-triggered bulk revoke) and registers those actions into the application-wide `AuditActionMap` via TypeScript module augmentation. This ensures the audit infrastructure is type-aware of the specific events this module can emit.

## Key elements

- **`apiKeysAuditActions`** — A `const` object with three string-literal action identifiers:
  - `ADMIN_API_KEY_MINTED` (`'admin.api_key.minted'`)
  - `ADMIN_API_KEY_REVOKED` (`'admin.api_key.revoked'`)
  - `SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE` (`'system.api_keys.revoked_on_compromise'`)
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with an `apiKeys` key typed to the union of the above values, making them part of the app-wide audit action type.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — The service that performs mint/revoke operations; it imports `apiKeysAuditActions` to emit the corresponding audit events.
- **`src/modules/api-keys/tests/integration/outcomes.test.ts`** — Integration tests that assert the correct audit action is recorded after mint, revoke, and compromise-revocation flows.

## Notes

- The file is declaration-only: no runtime logic, no functions. Its entire purpose is type-level registration and providing a shared constant for the action strings.
- The module-augmentation pattern is intentional (see `modules/account/audit.ts` for the rationale) — each domain module owns its slice of `AuditActionMap` rather than a central file listing every action.
- Action naming convention: `ADMIN_` prefix for operator-initiated writes, `SYSTEM_` for automated/defensive writes (compromise response).
