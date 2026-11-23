---
source: src/modules/notifications/tests/unit/repository.test.ts
source_sha256: b586116027cfa93ac31a0f2c73b7904de55a19381ac85be4cb7aa355ca2af4f8
context_sha256: d0e9604569a7d1c526d2cb9a6b142bb9dbdb14dc65c908bd624408780ad55591
generated_at: 2026-11-22T05:59:13.355037+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/repository.test.ts

## Purpose
Unit tests asserting that `notificationRepository` methods given a malformed user id fail as a promise rejection rather than a synchronous throw. This matters because `toObjectId` runs inside an `async` method, and a promise chain at the call site only handles rejections. No database is touched; the id is refused before a query is built.

## Key elements
- `describe('a malformed user id')` — the single test group.
- `deleteByUserId('bad')` test — expects a rejection that is an instance of `mongo.BSON.BSONError`.
- `deleteByAudience('bad', 'own')` test — same assertion for this method.

## Relationships
- Imports `notificationRepository` from `@modules/notifications/repository` (`src/modules/notifications/repository.ts`) and exercises its `deleteByUserId` and `deleteByAudience` methods.

## Notes
- Each test awaits `expect(...).rejects`, so a synchronous throw from the repository would fail the test instead of being caught as a rejection.
- The `'bad'` id is not a valid ObjectId, which is what triggers the `BSONError`.
- `mongo` is imported from `mongoose` only to reference `mongo.BSON.BSONError` as the expected error type.
