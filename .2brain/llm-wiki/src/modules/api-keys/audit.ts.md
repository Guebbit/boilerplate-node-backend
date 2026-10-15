---
source: src/modules/api-keys/audit.ts
sha256: 0729239a5a13fe46d665962322db37a3a0b91d869b922ad29259cc5805e4274b
generated_at: 2026-10-15T10:20:11.908826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/audit.ts

## Purpose

Declares the audit-action vocabulary for API-key credential events (mint, revoke, bulk-revoke-on-compromise) and registers it into the app-wide `AuditActionMap` type via module augmentation. This file contains no runtime logic beyond the constant declaration; its job is to give the API-key domain a typed, centrally-registered set of action identifiers that the observability layer and downstream consumers (dashboards, incident tooling) can reference.

## Key elements

- **`apiKeysAuditActions`** (exported const, `as const`) — Three string-literal actions:
  - `ADMIN_API_KEY_MINTED` (`admin.api_key.minted`) — a credential was created.
  - `ADMIN_API_KEY_REVOKED` (`admin.api_key.revoked`) — a credential was revoked.
  - `SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE` (`system.api_keys.revoked_on_compromise`) — all credentials belonging to a user were revoked as part of a compromise response.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds an `apiKeys` key to the shared `AuditActionMap` interface, typed to the union of the three values above. This makes the actions a first-class member of the app-wide audit type system at compile time.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — The service layer that performs mint/revoke operations would emit these audit actions (the ones declared here) when those mutations succeed. This file defines *what* is emitted; the service defines *when*.
- **`src/modules/api-keys/tests/integration/outcomes.test.ts`** — Integration tests that assert the correct audit actions appear in the event log for mint, revoke, and compromise-revoke scenarios.

## Notes

- The file is a pure type/constant module: no imports, no functions, no side effects at runtime.
- The augmentation pattern (rather than a standalone union type) is intentional — the header comment points to `modules/account/audit.ts` as the precedent. This keeps every domain's actions in a single `AuditActionMap` so downstream consumers can iterate over all known actions without per-module imports.
- The `system.` prefix on `SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE` distinguishes automated, account-wide revocations from individual `admin.` actions; tooling or alerting rules may branch on that prefix.
