---
source: src/modules/webhooks/domain/index.ts
sha256: 36ef20595cf27f39efaa0fc92e7876bcf4c18b84849c7a5c683d322b8a020d13
generated_at: 2026-11-08T09:02:43.310291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/domain/index.ts

## Purpose

Barrel file for the webhooks domain layer. It flat-re-exports the pure business rules (retry/backoff logic and event matching) from `backoff.ts` and `event-filter.ts` so that consumers can import domain rules from a single, stable entry point without reaching into individual files.

## Key elements

- **Re-exports from `./backoff`:**
  - `WEBHOOK_RETRY_DELAYS_MS` – constant defining the retry delay schedule (in ms).
  - `WEBHOOK_MAX_ATTEMPTS` – cap on total delivery attempts.
  - `WEBHOOK_MAX_CONSECUTIVE_FAILURES` – threshold that triggers auto-disable.
  - `WEBHOOK_MIN_FAILING_MS` – minimum duration a target must be failing before auto-disable applies.
  - `nextRetryDelayMs` – computes the delay for the next retry.
  - `nextAttemptAt` – computes the timestamp for the next scheduled attempt.
  - `shouldAutoDisable` – determines whether a webhook should be automatically disabled.
- **Re-exports from `./event-filter`:**
  - `matchesEventFilter` – checks whether a given event satisfies a webhook's filter.
  - `ALL_EVENTS` – constant representing a filter that matches every event.

## Relationships

- **`./backoff`** and **`./event-filter`** – the two source modules whose exports this file re-exports. No logic is added here.
- **`src/modules/webhooks/index.ts`** – the module-level barrel that re-exports from this file, making the domain rules available to the rest of the webhooks feature.
- **`src/modules/webhooks/services/attempt.ts`**, **`services/catalog.ts`**, **`services/publish.ts`** – service-layer consumers that import backoff constants and the event-filter helper (either via this barrel or directly from the domain sub-files).
- **Tests** (`backoff.test.ts`, `event-filter.test.ts`, `delivery.test.ts`, `ops-webhook-retry-job.test.ts`) – exercise the re-exported rules; they import from this file or its siblings.

## Notes

- The file intentionally uses flat re-exports rather than namespace imports (`export * as backoff`). The header comment justifies this: with only two source files the collision risk is negligible, and flat names keep call-sites concise.
- No logic lives here. Any change to a rule belongs in `backoff.ts` or `event-filter.ts`, not in this barrel.
- The header references `docs/theory/domain-layer.md` for the criteria that determine what qualifies as a "domain rule" versus a service concern.
