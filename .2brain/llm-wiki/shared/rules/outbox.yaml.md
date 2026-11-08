---
source: shared/rules/outbox.yaml
sha256: 14da1cdf42b8c69fb9af3120ebe81298f6b9184080269ae217c6ab24b68fb627
generated_at: 2026-11-08T03:10:02.041177+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/outbox.yaml

## Purpose

Single source of truth for the transactional outbox's default retry and retention policy. It is a data file consumed by a code-generation step (`npm run regenerate`) that emits `src/kernel/outbox.generated.ts` for the PHP twin; it is never read at runtime directly.

## Key elements

- **retentionDays** (`7`) – How many days a published outbox row survives before the sweep job deletes it.
- **maxAttempts** (`10`) – Dispatch failure count after which a row is parked as `dead`.
- **leaseSeconds** (`60`) – Duration of a relay's exclusive claim on a row; must be longer than the longest dispatch to prevent duplicates.
- **backoffBaseMs** (`5000`) – Initial wait after the first failure; doubles on each subsequent failure.
- **backoffCapMs** (`3600000`) – Upper bound on the exponential backoff (1 hour).

## Relationships

- **shared/rules/jobs.yaml** – Sibling rule file in `shared/rules/`; both are YAML data files in the same directory that feed the shared code-generation pipeline.
- **shared/rules/metrics.yaml** – Sibling rule file in `shared/rules/`; shares the same "YAML → generated TS" regeneration contract.

## Notes

- Three values (`retentionDays`, `maxAttempts`, `leaseSeconds`) are overridable at runtime via `NODE_OUTBOX_*` environment variables; the two backoff values are **fixed** and cannot be changed without editing this file and re-running codegen.
- Units are encoded in the key name (days, seconds, milliseconds) — there is no separate unit field.
- Edits to this file have no effect until `npm run regenerate` is re-run; the generated file is the one that actually ships.
