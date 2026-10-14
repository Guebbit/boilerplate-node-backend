---
source: src/modules/feedback/domain/lifecycle.ts
sha256: cc44e764bce98ae820a7b4218b2176d351c571ab3897bcb17949a742168183f1
generated_at: 2026-10-14T15:49:28.662709+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/domain/lifecycle.ts

## Purpose

Pure domain logic for the feedback ticket's status lifecycle. It defines how a ticket is initially classified, how an incoming status string is validated against the closed 4-value enum, and when the `respondedAt` timestamp is stamped. There is intentionally no transition graph or `canTransition` guard — staff may re-triage a ticket to any status at any time, including backward.

## Key elements

- **`FEEDBACK_STATUS_VALUES`** (private) — `Object.values` of the generated `FeedbackRequestStatus` enum, used as the membership set for the narrowing check.
- **`toFeedbackStatus(status?: string)`** — Narrows an arbitrary string onto the `FeedbackRequestStatus` type; returns `undefined` if the value is outside the enum. Acts as a defense-in-depth guard for callers that bypass the HTTP-layer Zod validation (e.g. internal service paths).
- **`initialFeedbackStatus(suspectedSpam: boolean)`** — Returns `spam` when the submission looks like spam (skipping operator notification), otherwise `new`.
- **`shouldStampRespondedAt(nextStatus, alreadyResponded)`** — Returns `true` only when the write is transitioning the ticket to `resolved` **and** `respondedAt` has not been set before. Guarantees the timestamp is written exactly once per ticket lifetime.

## Relationships

- **`src/types/index.ts`** — Provides the `FeedbackRequestStatus` enum that this module imports and validates against.
- **`src/modules/feedback/domain/index.ts`** — Re-exports this module so callers can reach these helpers via the domain barrel.
- **`src/modules/feedback/service.ts`** — Consumer of the three exports: calls `toFeedbackStatus` to sanitize input, `initialFeedbackStatus` on creation, and `shouldStampRespondedAt` before persisting a status write.
- **`src/modules/feedback/tests/unit/lifecycle.test.ts`** — Unit-tests each export's truth table (valid/invalid strings, spam vs. non-spam init, first-resolve vs. re-resolve stamping).

## Notes

- The "narrow away rather than trust" philosophy is explicit: `toFeedbackStatus` returns `undefined` for bad input instead of throwing, so the caller decides the error path.
- `shouldStampRespondedAt` is deliberately stateless — it takes `alreadyResponded` as a parameter rather than inspecting the ticket, keeping it a pure function.
- Unlike `orders`/`payments` modules in the codebase, there is no transition matrix here; any status is a valid target for any other.
