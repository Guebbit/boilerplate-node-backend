---
source: src/modules/notifications/tests/unit/schema-contract.test.ts
sha256: b42aa59ea88787a49efe4a923824501a5c56d4bfdc067bef44903e4e26495602
generated_at: 2026-10-29T04:34:28.393437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/schema-contract.test.ts

## Purpose
Contract test that locks the **declarations** of the `notificationSchema` (required fields, closed enums, defaults, refs, indexes, timestamp options). It does not create documents; it asserts that the schema's shape matches the intended invariants so that a dropped enum, flipped index direction, or accidental default would be caught at review time.

## Key elements
- **`describe('notificationSchema')`** — single suite, seven assertions:
  - *Required paths* — asserts exactly `['audience', 'code', 'severity', 'userId']`.
  - *`readAt` absence* — confirms it is **not** required and has **no** default (a default would mark new rows as already read).
  - *Closed enums* — `code` equals `NOTIFICATION_CODES`; `severity` equals `Object.values(NotificationSeverity)`.
  - *`params` default* — must be `{}`, since its shape varies by `code`.
  - *`userId` ref* — must point to `'User'`.
  - *Index specs* — expects exactly three: TTL (`expiresAt_1`), inbox/dedupe (`userId_1_createdAt_-1`), work-notice dedupe (`userId_1_dedupeKey_1`). Order matters in the assertion.
  - *`audience`* — default `'own'`, enum `['own', 'staff']`.
  - *Timestamps* — `createdAt: true`, `updatedAt: false` (rows are written once, never mutated).

## Relationships
- **`src/modules/notifications/model.ts`** — source of `notificationSchema` (the object under test) and `NOTIFICATION_CODES` (the closed set for `code`).
- **`src/types/index.ts`** — provides the `NotificationSeverity` enum whose values the test pins as the allowed `severity` set.
- **`tests/support/schema.ts`** — supplies the inspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `refOf`, `indexSpecs`, `optionsOf`) that extract schema metadata without instantiating documents.

## Notes
- The index `userId_1_createdAt_-1` is asserted **by position and direction**; flipping `createdAt` to ascending would fail the test even though the column set is unchanged.
- `params` is intentionally a plain object with no sub-schema: its shape is governed by the `code` value at write-time, not by the Mongoose schema.
- The `dedupeKey` index exists solely to keep a redelivered work-notice event to one row per recipient; it is not part of the inbox query path.
