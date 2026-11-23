---
source: src/modules/notifications/tests/unit/schema-contract.test.ts
source_sha256: 7a2ec0b4561a9572e6447f2129ce22be1a390181421825416e50f2f3d2a2f962
context_sha256: 4cab8a8f3faf720ed405b08f48201ce2c431cdb6db81ac3cb2e256d24add1793
generated_at: 2026-11-22T05:59:25.712140+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/schema-contract.test.ts

## Purpose
Unit test pinning the declarative contract of `notificationSchema`: required paths, defaults, enums, refs, indexes and timestamp options. It checks the schema declarations rather than document validation, so a dropped enum or flipped index direction fails here even though no valid fixture would change.

## Key elements
- `describe('notificationSchema')` with eight tests:
  - **Required paths**: exactly `audience`, `code`, `severity`, `userId`.
  - **`readAt`**: not required and has no default, since a default would mark new notifications as already read.
  - **Enums**: `severity` equals `Object.values(NotificationSeverity)`. `code` has no enum, so each writing module owns its own codes.
  - **`params`**: defaults to `{}`.
  - **`userId`**: refs `'User'`.
  - **Indexes**: exactly `expiresAt_1`, `userId_1_createdAt_-1` (inbox read, and the cap's trim from the far end) and `userId_1_dedupeKey_1` (one row per recipient for a redelivered event). `expiresAt` is a TTL index so work notices age out.
  - **`audience`**: defaults to `'own'`, enum `['own', 'staff']`.
  - **Timestamps**: `{ createdAt: true, updatedAt: false }`, because a row is written once.

## Relationships
- `src/modules/notifications/model.ts`: provides `notificationSchema`, the sole subject under test.
- `src/types/index.ts`: provides `NotificationSeverity` (imported via `@types`), the expected value for the `severity` enum.
- `tests/support/schema.ts`: provides the introspection helpers `defaultOf`, `enumOf`, `indexSpecs`, `optionsOf`, `refOf` and `requiredPaths` (imported via `@tests/schema`).

## Notes
- The `code` test asserts `enumOf(...) ?? []` equals `[]`, so adding an enum to `code` will fail the test deliberately.
- The index list is compared as a sorted, exact array of formatted strings (`name: field±1, ...`). Any added, removed or reordered index fails it.
