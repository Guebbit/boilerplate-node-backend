---
source: shared/rules/schemas/outbox.generated.schema.json
source_sha256: b174b139ebe3897cccd8e1b10aef1a6572ded6522930453cbe97377655f87e11
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:28:07.303348+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/outbox.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that describes the shape of the outbox configuration. It validates an object with a single top-level `outbox` key holding five tuning parameters for an outbox-style retry/delivery mechanism. The `.generated` name suggests it is produced from another source (likely a TypeScript/Zod definition) and should not be edited by hand.

## Key elements
All properties below live under the required top-level `outbox` object. Each is an `integer` with `exclusiveMinimum: 0` (so at least 1) and `maximum: 9007199254740991` (2^53 − 1).
- `retentionDays` — retention period, in days.
- `maxAttempts` — maximum number of attempts.
- `leaseSeconds` — lease duration, in seconds.
- `backoffBaseMs` — base backoff delay, in milliseconds.
- `backoffCapMs` — cap on the backoff delay, in milliseconds.

## Relationships
No graph neighbors are listed, so no dependencies or consumers are visible from this file.

## Notes
- All five fields are required, and `additionalProperties: false` is set on both the root and the `outbox` object. Unknown keys are rejected and there are no defaults.
- The schema enforces only type and range. It does not enforce that `backoffCapMs >= backoffBaseMs`.
- The `9007199254740991` maximum is characteristic of a generator mapping a safe-integer number type, such as Zod's `.int().positive()`. The generator is inferred, not stated in the file.
