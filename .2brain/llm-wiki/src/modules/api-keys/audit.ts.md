---
source: src/modules/api-keys/audit.ts
sha256: 441e0415a43199beaa957a9159bd006714df4d939b3c710522da069b4a62799c
generated_at: 2026-09-23T18:23:25.478510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/audit.ts

## Purpose

Declares the audit-action vocabulary for the API-keys module (mint and revoke) and registers it into the app-wide `AuditActionMap` type via TypeScript module augmentation. The file contains no runtime logic — it exists so that the two credential-lifecycle events carry a strongly-typed, discoverable action identifier wherever the audit logger is invoked.

## Key elements

- **`apiKeysAuditActions`** (exported const) — The two action strings this module owns: `admin.api_key.minted` and `admin.api_key.revoked`. The `as const` assertion gives each property a literal type, which feeds into the map below.
- **`declare module '@infrastructure/observability/audit'`** (module augmentation) — Adds an `apiKeys` key to the global `AuditActionMap` interface, typing its value as the union of all `apiKeysAuditActions` values. This makes the actions available to any file that imports from the audit infrastructure without needing to import this file directly.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — The service that performs the actual mint/revoke operations. It is the expected consumer of `apiKeysAuditActions` when emitting audit log entries for those write events. This file defines the vocabulary; the service file uses it.

## Notes

- The module augmentation pattern is intentional and mirrors `modules/account/audit.ts` (referenced in the file's doc comment). New audit actions for this domain should be added here, not ad-hoc at the call site.
- Because this file has no imports and no side effects, it is safe to import purely for its type contribution. The `declare module` block is the only coupling to external code (the `@infrastructure/observability/audit` module).
