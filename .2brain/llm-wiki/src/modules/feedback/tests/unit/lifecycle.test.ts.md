---
source: src/modules/feedback/tests/unit/lifecycle.test.ts
sha256: 636329f675e27e13ddaf34fd569320efaee6ae51fbdbbc2872b390a922889569
generated_at: 2026-10-14T15:52:43.024373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/lifecycle.test.ts

## Purpose
Unit tests for the feedback-ticket status lifecycle rules (`toFeedbackStatus`, `shouldStampRespondedAt`, `initialFeedbackStatus`). The file exists to lock down the contract between the status enum and the three pure domain helpers without any database or mock dependencies.

## Key elements
- **`EVERY_STATUS`** — `Object.values(FeedbackRequestStatus)`; used to iterate the full enum so a newly added status is covered automatically without editing this test.
- **`describe('toFeedbackStatus …')`** — Verifies the function is a strict identity on every valid enum value and returns `undefined` for `undefined`, empty string, wrong-case strings, and prototype-pollution probes (`'constructor'`, `'__proto__'`).
- **`describe('shouldStampRespondedAt …')`** — Confirms the timestamp is stamped *only* when the target status is `resolved` **and** the ticket has not already been responded to; every other combination (including `undefined` status) yields `false`.
- **`describe('initialFeedbackStatus …')`** — Confirms a fresh ticket starts as `spam` when the spam flag is `true`, otherwise `new`.

## Relationships
- **`src/modules/feedback/domain/lifecycle.ts`** — The system under test; all three imported functions are exercised here with no further dependencies.
- **`src/types/index.ts`** — Source of the `FeedbackRequestStatus` enum. The test derives its full status list from this enum, so adding a new status upstream automatically adds a round-trip and "not-resolved" assertion here.

## Notes
- Tests are written with `it.each` over `EVERY_STATUS` specifically so the suite stays green when a new enum member is added upstream; there is no hardcoded status list to maintain.
- The negative-case list for `toFeedbackStatus` intentionally includes `__proto__` and `constructor` to guard against prototype-pollution edge cases in the narrowing logic.
- No mocks, no fixtures, no I/O — the file is safe to run in isolation and in CI with zero setup.
