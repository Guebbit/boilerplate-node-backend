---
source: src/modules/webhooks/domain/index.ts
sha256: 36ef20595cf27f39efaa0fc92e7876bcf4c18b84849c7a5c683d322b8a020d13
generated_at: 2026-09-23T19:39:46.659816+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/index.ts

## Purpose

Barrel file for the webhooks domain layer. It re-exports the pure rules (retry/backoff constants and helpers, event-filtering logic) from two sibling modules so that consumers can import from a single entry point without reaching into sub-paths.

## Key elements

- **From `./backoff`:**
    - `WEBHOOK_RETRY_DELAYS_MS` – array of retry delay values (ms).
    - `WEBHOOK_MAX_ATTEMPTS` – cap on delivery attempts.
    - `WEBHOOK_MAX_CONSECUTIVE_FAILURES` – threshold before auto-disable.
    - `WEBHOOK_MIN_FAILING_MS` – minimum failure window considered.
    - `nextRetryDelayMs` – computes the delay for the next retry.
    - `nextAttemptAt` – computes the timestamp for the next attempt.
    - `shouldAutoDisable` – determines whether a webhook should be disabled.
- **From `./event-filter`:**
    - `matchesEventFilter` – tests whether an event passes a webhook's filter.
    - `ALL_EVENTS` – sentinel/value representing "no filter".

## Relationships

- **Re-exports from** `src/modules/webhooks/domain/backoff.ts` and `src/modules/webhooks/domain/event-filter.ts` (the two actual implementations).
- **Re-exported by** `src/modules/webhooks/index.ts`, making these symbols available at the module-level public API.
- **Consumed by** `src/modules/webhooks/services/attempt.ts` and `src/modules/webhooks/services/publish.ts`, which call the backoff and filter helpers during delivery.
- **Exercised by** `src/modules/webhooks/tests/unit/backoff.test.ts`, `src/modules/webhooks/tests/unit/event-filter.test.ts`, and `src/modules/webhooks/tests/integration/delivery.test.ts`.

## Notes

- Re-exports are deliberately **flat** (not `import * as backoff`), per the header comment: with only two source files the collision risk is negligible, and flat imports keep call-sites simple.
- The header references `docs/theory/domain-layer.md` as the authority for what qualifies as a "pure rule" belonging in this directory. Any new file here must satisfy that criterion before being added to the barrel.
