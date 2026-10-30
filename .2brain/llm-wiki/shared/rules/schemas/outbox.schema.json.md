---
source: shared/rules/schemas/outbox.schema.json
sha256: b174b139ebe3897cccd8e1b10aef1a6572ded6522930453cbe97377655f87e11
generated_at: 2026-10-29T01:48:51.068708+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/outbox.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates the shape of the `outbox` configuration section. It enforces strict, non-nullable integer values for the five outbox tuning knobs (retention, retry, lease, and backoff parameters) and rejects any unexpected keys at both the top level and the `outbox` object level.

## Key elements

- **Top-level object** — must contain a single required key `outbox`; `additionalProperties: false`.
- **`outbox.retentionDays`** — integer > 0, ≤ `Number.MAX_SAFE_INTEGER`; how long outbox entries are kept before expiry.
- **`outbox.maxAttempts`** — integer > 0, ≤ `Number.MAX_SAFE_INTEGER`; upper bound on delivery retries.
- **`outbox.leaseSeconds`** — integer > 0, ≤ `Number.MAX_SAFE_INTEGER`; lease duration for a claimed outbox entry.
- **`outbox.backoffBaseMs`** — integer > 0, ≤ `Number.MAX_SAFE_INTEGER`; base multiplier for exponential backoff between attempts.
- **`outbox.backoffCapMs`** — integer > 0, ≤ `Number.MAX_SAFE_INTEGER`; ceiling on the backoff delay.
- All five properties are listed in the `required` array; `additionalProperties: false` on the `outbox` object.

## Relationships

No graph neighbors.

## Notes

- `maximum: 9007199254740991` is `Number.MAX_SAFE_INTEGER` in JavaScript; it effectively means "any positive integer" but is spelled out for consumers that don't support `maximum: Infinity`.
- `exclusiveMinimum: 0` (not `minimum: 1`) is the 2020-12 idiom; both enforce the same constraint but tooling may expect the keyword name.
- Because `additionalProperties: false` is set at **both** levels, adding a new configuration field to the outbox section will fail validation until this schema is updated.
