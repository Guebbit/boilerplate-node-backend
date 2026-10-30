---
source: src/infrastructure/config/shared-rules/log-redaction.ts
sha256: 62d95c207b19a5bd39b521f0607870900a66732a4b6ec5aa9f7975d374b45f76
generated_at: 2026-10-29T01:59:39.889122+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/log-redaction.ts

## Purpose

Defines the Zod schema and inferred TypeScript type for `shared/rules/log-redaction.yaml`, declaring which log keys are credentials (dropped), which are personal data (hashed), and which URL query parameters must be stripped from trace-span attributes. It exists so that runtime components can validate and consume redaction policy from a single typed source.

## Key elements

- **`logRedactionSchema`** – A `z.strictObject` with four fields, each a non-empty array of non-empty strings:
  - `sensitiveFields` – Exact (normalised) key names whose values are never logged.
  - `sensitiveKeyFragments` – Substring fragments that mark a key as sensitive wherever they appear.
  - `personalFields` – Key names containing personal data; hashed by default rather than dropped.
  - `traceUrlSecrets` – Query parameters a span's URL must not carry in clear.
- **`LogRedactionRules`** – `z.infer<typeof logRedactionSchema>`; the resolved object type for a parsed YAML file.
- **`names`** (module-local) – Reusable Zod helper: `z.array(z.string().min(1)).min(1)`.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – Co-located in the same `shared-rules` directory; the registry most likely imports `logRedactionSchema` to register it alongside other shared-rule schemas for unified loading/validation.
- **`src/infrastructure/adapters/logger.ts`** – The logger adapter is the primary consumer of `sensitiveFields`, `sensitiveKeyFragments`, and `personalFields` when deciding whether to drop or hash a log value.
- **`src/infrastructure/runtime/otel-sdk.ts`** – The OTel SDK setup consumes `traceUrlSecrets` to scrub disallowed query parameters from span URL attributes before export.

## Notes

- The schema is **strict**: any key not listed in the four fields above will cause a validation error. There is no `passthrough` or `catchall`.
- The docblock enforces a **relative-imports-only** convention (see `src/infrastructure/config/shared-rules/load.ts`); this file currently imports only `zod`, which is external, but any future additions should follow that rule.
- `sensitiveFields` and `sensitiveKeyFragments` operate at different granularity (exact match vs. substring match). A key can be redacted by either rule.
