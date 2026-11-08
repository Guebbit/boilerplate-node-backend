---
source: src/modules/webhooks/rules.yaml
sha256: f8e39dc775af4bfdb388e64fb92dd2490259ae51236db8aa42c2f3fd6531adb0
generated_at: 2026-11-08T09:05:02.834673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/rules.yaml

## Purpose

Single source of truth for webhook-delivery retry and auto-disable thresholds. It is plain YAML consumed by a build step (`npm run regenerate` → `rules.generated.ts`) and copied into the PHP counterpart, so both runtimes enforce identical delivery policy without hand-syncing numbers.

## Key elements

- **`retry.delaysMs`** — Ordered array of five back-off intervals (5 s, 5 min, 30 min, 2 h, 10 h). Index 0 is the wait *after* the first failed attempt (1-based attempt numbering). After the fifth delay the subscription is marked EXHAUSTED.
- **`autoDisable.maxConsecutiveFailures`** (5) — Number of consecutive EXHAUSTED chains (not single attempts) required before a subscription is auto-disabled.
- **`autoDisable.minFailingMs`** (259 200 000 = 3 days) — Minimum wall-clock duration the failing streak must span before auto-disable is permitted. Mirrors Stripe's own 3-day threshold and prevents a short platform outage from mass-disabling active subscribers.

## Relationships

- **`src/modules/webhooks/openapi.yaml`** — Co-located in the same module; openapi.yaml defines the webhook-subscription API surface while this file defines the operational delivery policy that governs that surface at runtime. The two are maintained together as the webhooks module's specification pair.

## Notes

- **Not a runtime read.** Nothing imports this YAML at boot. The only consumer is the `npm run regenerate` script that emits `rules.generated.ts`; editing the YAML without re-running the script has no effect.
- **No expressions allowed.** Durations must be written out as full millisecond integers in the value; units live in the key name (`…Ms`). This constraint exists so the PHP twin can copy values verbatim without a YAML-expression evaluator.
- **`delaysMs` is indexed by failed attempt, not by retry number.** The first element corresponds to the pause *after* attempt 1 fails, so the array length (5) equals the total number of retries, not "retries + 1".
- **EXHAUSTED ≠ a single failed attempt.** `maxConsecutiveFailures` counts full retry chains that ran out of delays, not individual HTTP failures.
