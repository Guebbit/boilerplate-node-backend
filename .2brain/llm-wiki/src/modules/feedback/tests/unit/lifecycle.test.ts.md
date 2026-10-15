---
source: src/modules/feedback/tests/unit/lifecycle.test.ts
sha256: e5289fb12b0920d9bd44ceaef6199918154d57d5e7fe502dd3a9f8e8cbb95f5d
generated_at: 2026-10-15T10:33:16.195869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the two pure functions exported by `domain/lifecycle.ts`: `shouldStampRespondedAt` (decides whether a ticket transition warrants a "responded at" timestamp) and `initialFeedbackStatus` (maps a spam-signal flag to the starting status of a new ticket). No mocks or database are used; the tests exercise the functions in isolation.

## Key elements

- **`EVERY_STATUS`** — `Object.values(FeedbackRequestStatus)`. Derives the full status list from the contract enum at runtime so that any future enum member is automatically included in the "no other status stamps" loop test without editing this file.
- **`describe('shouldStampRespondedAt …')`** — Table-driven (`it.each`) coverage of the (status × alreadyResponded) matrix, plus two guard tests: (1) every non-`resolved` status returns `false`, and (2) passing `undefined` as the status (i.e. the write leaves status untouched) returns `false`.
- **`describe('initialFeedbackStatus …')`** — Two assertions confirming that `true` (suspected spam) yields `spam` and `false` yields `new`.

## Relationships

- **`src/modules/feedback/domain/lifecycle.ts`** — The system under test. This file imports `initialFeedbackStatus` and `shouldStampRespondedAt` directly; every assertion exercises one of those two exports.
- **`src/types/index.ts`** — Source of the `FeedbackRequestStatus` contract enum. The test reads the enum *from* that module (never re-declares it) and uses `Object.values` on it to build the exhaustive status list.

## Notes

- The "stamps for no status other than resolved" test iterates `EVERY_STATUS` at runtime, so adding a new enum value in `src/types/index.ts` automatically extends that test with zero changes here.
- The `undefined` status case is intentional: it guards the "write leaves status untouched" branch inside `shouldStampRespondedAt` and would fail if the implementation assumed the parameter is always a valid enum member.
