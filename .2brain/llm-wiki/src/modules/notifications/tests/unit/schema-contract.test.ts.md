---
source: src/modules/notifications/tests/unit/schema-contract.test.ts
sha256: ba1b26a7a19ec8e91eec527d91e5d6206009b2ad55299bd7d6d765f1b96fde5b
generated_at: 2026-11-08T06:37:07.440399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the **schema contract** (field declarations, constraints, and indexes) of `notificationSchema` without exercising document-level behavior. It guards against silent drift in required fields, enum membership, defaults, index shape, and timestamp options — changes that would break the inbox read, the cap trim, or deduplication even though no single fixture goes invalid.

## Key elements

- **`describe('notificationSchema')`** — single suite covering seven contract assertions:
  - **Required paths** — asserts exactly `audience`, `code`, `severity`, `userId` are required.
  - **`readAt` absence** — verifies it is neither required nor defaulted (a default would silently mark every row as read).
  - **Enum openness** — `severity` must equal `Object.values(NotificationSeverity)`; `code` must have **no** enum (open set owned by the writing module).
  - **`params` default** — must be `{}` since its shape is code-dependent.
  - **`userId` ref** — must point to the `User` collection.
  - **Index specs** — asserts three compound indexes: `expiresAt+1` (TTL), `userId+1, createdAt-1` (inbox read / cap trim), `userId+1, dedupeKey+1` (redelivery dedupe).
  - **`audience`** — defaults to `'own'`; enum is `['own', 'staff']`.
  - **Timestamps** — `createdAt: true`, `updatedAt: false` (rows are write-once, immutable).

## Relationships

- **`src/modules/notifications/model.ts`** — source of `notificationSchema`, the sole subject under test.
- **`src/types/index.ts`** — provides `NotificationSeverity`, used as the expected closed set for the `severity` field.
- **`tests/support/schema.ts`** — supplies the introspection helpers (`requiredPaths`, `enumOf`, `defaultOf`, `refOf`, `indexSpecs`, `optionsOf`) that extract schema metadata for assertions.

## Notes

- The `code` field is deliberately **not** constrained by an enum in the schema; the test asserts `enumOf(...) ?? []` equals `[]`. Adding an enum here would be a contract violation.
- The `userId + createdAt` index is direction-flipped (`createdAt_-1`) so the same index serves both the newest-first inbox query and the oldest-first cap trim; changing the sort direction in either consumer breaks the shared index contract.
- The timestamp assertion (`updatedAt: false`) encodes the invariant that a notification row is **written once and never mutated** — adding `updatedAt` would signal a write-path change.
