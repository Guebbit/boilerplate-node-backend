---
source: src/modules/feedback/domain/lifecycle.ts
sha256: b3e8b6ee9cd609a72af8bb9a60d4b72e972c81d21932f9fa1364bfdb3af087fd
generated_at: 2026-10-15T10:31:53.149512+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/domain/lifecycle.ts

## Purpose

Encodes the two business rules around a feedback ticket's status lifecycle: how a fresh ticket is initially classified, and when the `respondedAt` timestamp gets stamped. Unlike the orders/payments domains, there is no `canTransition` gate—staff may move a ticket to any of the four `FeedbackRequestStatus` values in any direction.

## Key elements

- **`initialFeedbackStatus(suspectedSpam: boolean)`** — Returns `FeedbackRequestStatus.spam` if the submission looked like spam (skipping operator notification), otherwise `FeedbackRequestStatus.new`.
- **`shouldStampRespondedAt(nextStatus, alreadyResponded)`** — Returns `true` only when the incoming write sets the status to `resolved` **and** the ticket does not already carry a `respondedAt` stamp. Prevents re-resolving from moving the timestamp.
- **`FeedbackRequestStatus`** (imported from `@types`) — The closed 4-value enum: `new`, `in_progress`, `resolved`, `spam`.

## Relationships

- **`src/types/index.ts`** — Source of the `FeedbackRequestStatus` enum consumed by both exported functions.
- **`src/modules/feedback/domain/index.ts`** — Barrel file; re-exports the two functions so consumers can import from the domain folder.
- **`src/modules/feedback/service.ts`** — Primary caller; uses `initialFeedbackStatus` when creating a ticket and `shouldStampRespondedAt` before persisting a triage write.
- **`src/modules/feedback/tests/unit/lifecycle.test.ts`** — Unit tests covering both functions' edge cases (backward transitions, repeat-resolve, `undefined` nextStatus).

## Notes

- `shouldStampRespondedAt` accepts `nextStatus: FeedbackRequestStatus | undefined`. The `undefined` case represents a write that leaves status untouched (e.g., editing only the body)—in that case it always returns `false`.
- The "no gated transitions" design is deliberate: there is intentionally **no** `canTransition` export here. Do not add one without a product decision, because staff re-triage is a first-class workflow.
