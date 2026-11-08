---
source: shared/rules/schemas/outbox.schema.json
sha256: b174b139ebe3897cccd8e1b10aef1a6572ded6522930453cbe97377655f87e11
generated_at: 2026-11-08T03:11:15.257745+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/outbox.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates an outbox configuration object. It defines the shape and constraints for the tunable parameters of the outbox subsystem—retention, retry attempts, lease timing, and exponential-backoff settings—so that consumers can reject malformed configs at validation time.

## Key elements

- **Top-level object** — requires a single `outbox` key; no additional properties allowed.
- **`outbox` object** — requires all five of the following properties; no additional properties allowed:
  - `retentionDays` (integer, > 0) — how long outbox entries are retained.
  - `maxAttempts` (integer, > 0) — upper bound on delivery attempts.
  - `leaseSeconds` (integer, > 0) — duration of a processing lease.
  - `backoffBaseMs` (integer, > 0) — base interval for exponential backoff.
  - `backoffCapMs` (integer, > 0) — ceiling on backoff delay.
- **Constraints** — every field uses `exclusiveMinimum: 0` (must be ≥ 1) and `maximum: 9007199254740991` (safe-integer upper bound).

## Relationships

No dependency-graph neighbors are recorded for this file.

## Notes

- The `maximum` value (`9007199254740991` = 2⁵³ − 1) is the ECMAScript safe-integer limit; it effectively means "no practical upper bound" while keeping the value representable in JS `number` type without precision loss.
- `additionalProperties: false` is enforced at **both** the top level and the `outbox` level, so any typo'd key name will fail validation.
- Because every field is `required`, partial or empty outbox configs are always invalid—consumers must supply all five values.
