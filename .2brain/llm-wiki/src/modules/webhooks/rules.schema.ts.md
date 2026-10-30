---
source: src/modules/webhooks/rules.schema.ts
sha256: 5608f366110c31e8be119ffbc206cbaf4753d1427a35ddd246381bfb59cb83f6
generated_at: 2026-10-29T06:28:55.075826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/rules.schema.ts

## Purpose

Defines the Zod schema for `rules.yaml` (the webhook retry ladder and auto-disable thresholds) and the `GenerateSpec` that tells the codegen pipeline what to emit as `rules.generated.ts`. It is the single source of truth for the numeric constants that both the TypeScript runtime and a PHP twin consume.

## Key elements

- **`count`** (internal) – Zod validator: positive whole number.
- **`rulesSchema`** (exported) – `z.strictObject` describing `rules.yaml`. Two sub-objects:
  - `retry.delaysMs` – array (≥ 1 entry) of positive-int millisecond waits; the last entry terminates the retry ladder.
  - `autoDisable.maxConsecutiveFailures` – positive int; chain count before a subscription is switched off.
  - `autoDisable.minFailingMs` – positive int; minimum streak duration in ms.
- **`rulesGenerate`** (exported, typed as `GenerateSpec`) – Codegen descriptor: writes to `src/modules/webhooks/domain/rules.generated.ts` with two verbatim exports — `retryRules` (source field `retry`) and `autoDisableRules` (source field `autoDisable`).

## Relationships

- **`src/infrastructure/config/shared-rules/generate-spec.ts`** – Supplies the `GenerateSpec` type that `rulesGenerate` conforms to, ensuring the shared codegen tool can read the `out`, `exports`, `shape`, and `field` fields generically across all shared-rule modules.

## Notes

- `z.strictObject` is used at every level: an unknown key in `rules.yaml` fails validation rather than being silently ignored.
- The module docblock ("numbers and lists the PHP twin copies, as data") signals that the generated TS file is consumed by a PHP counterpart; treat the values as shared configuration, not module-private.
- `shape: 'verbatim'` in `rulesGenerate` means the codegen copies the field values as-is (no transformation, no renaming of inner keys).
