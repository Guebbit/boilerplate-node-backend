---
source: src/modules/feedback/tests/unit/schema-contract.test.ts
sha256: 7a22c74b5c04354d97037b68da4a163ae2802dd700a5720a1dfac08ff49c4f99
generated_at: 2026-10-14T15:53:03.799831+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/schema-contract.test.ts

## Purpose

Contract test for `feedbackRequestSchema`. Pins the schema's public shape — required vs. optional fields, enum bounds, defaults, index definitions, and TTL — so that any change to the feedback-request contract is either intentional and reviewed or caught here. The design intent encoded in the tests: a stranger must supply enough to be reachable (email, subject, message) but is not obliged to identify themselves (name optional), and operator-side fields must remain absent until an operator acts.

## Key elements

- **`RETENTION_SECONDS`** — computed at module load from `currentEnvironment().NODE_FEEDBACK_RETENTION_DAYS` (fallback 730 days) converted to seconds. Used to assert the TTL value rather than hardcoding a number.
- **`describe('feedbackRequestSchema')`** — eight focused assertions:
  - `requiredPaths` contains exactly `email`, `message`, `subject` (and explicitly not `name`).
  - `defaultOf` for `respondedAt` and `adminNotes` is `undefined` (no default that would pre-mark a ticket as answered).
  - `enumOf` for `status` matches `Object.values(FeedbackRequestStatus)`; `defaultOf` for `status` is `FeedbackRequestStatus.new`.
  - `indexSpecs` lists `createdAt_1` (ascending) and `status_1_createdAt_-1` (compound queue index).
  - `optionsOf(...).timestamps` is `true`.
  - `indexOptionSpecs` confirms `expireAfterSeconds` appears only on `createdAt_1` and equals `RETENTION_SECONDS`; the compound index has no TTL option.
  - A final test re-asserts the ascending direction of `createdAt_1`, documenting that Mongo only honours TTL on a single-field ascending index.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/feedback/model.ts` | Source of `feedbackRequestSchema` under test. |
| `src/types/index.ts` | Provides the `FeedbackRequestStatus` enum used to assert the status field's allowed values and default. |
| `tests/support/schema.ts` | Supplies the schema-inspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that extract structural facts from a Mongoose schema. |
| `src/infrastructure/config/store.ts` | `currentEnvironment()` is called to read `NODE_FEEDBACK_RETENTION_DAYS`, keeping the TTL assertion in lockstep with the configured retention policy. |

## Notes

- The TTL assertion deliberately compares against the *configured* value (`RETENTION_SECONDS`) rather than a literal, so rotating the env var updates both the runtime policy and the test expectation in one place.
- The file's trailing test and its inline comment call out a real failure mode: placing `expireAfterSeconds` on the compound `status_1_createdAt_-1` index (descending on `createdAt`) would create an index that **silently never expires documents**. The ascending single-field `createdAt_1` index is the only valid TTL carrier.
- `RETENTION_SECONDS` is evaluated once at import time. If the config store is mockable per-test, the constant still reflects the value present at module-load; tests that change env mid-run would not see the updated value here.
