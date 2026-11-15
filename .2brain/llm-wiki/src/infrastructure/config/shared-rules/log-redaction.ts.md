---
source: src/infrastructure/config/shared-rules/log-redaction.ts
sha256: 7b61b6bae6e4a135ad38497a36919f8fc94b6eaae0055c77897719b95a24f470
generated_at: 2026-11-14T17:58:02.758966+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/log-redaction.ts

## Purpose

Defines the Zod validation schema for the `shared/rules/log-redaction.yaml` configuration file. It declares which log key names (or key fragments) contain credentials, which keys hold personal data, and which URL query parameters must not appear in clear inside OpenTelemetry span attributes. The schema is the single source of truth for what those YAML files are allowed to contain.

## Key elements

- **`logRedactionSchema`** (exported) — A `z.strictObject` with four required fields, each a non-empty array of non-empty strings:
  - `sensitiveFields` — Exact (normalised) key names whose values are replaced / never logged.
  - `sensitiveKeyFragments` — Substring fragments; any key containing one is treated as sensitive.
  - `personalFields` — Personal-data keys; hashed by default rather than dropped.
  - `traceUrlSecrets` — Query parameters that a trace span's URL attributes must not carry in clear.
- **`names`** (module-local) — Reusable Zod helper: `z.array(z.string().min(1)).min(1)` enforcing a non-empty list of non-empty strings.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Registers `logRedactionSchema` alongside other shared-rule schemas so the loader can validate all rule files in one pass.
- **`src/infrastructure/adapters/logger.ts`** — Consumes the validated `sensitiveFields` / `sensitiveKeyFragments` / `personalFields` arrays to decide whether a key is dropped, hashed, or passed through at log time.
- **`src/infrastructure/runtime/otel-sdk.ts`** — Reads `traceUrlSecrets` to strip or mask the listed query parameters from span URL attributes before export.

## Notes

- The schema is `strictObject`, so any unexpected top-level key in the YAML file causes a validation failure — there is no silent pass-through of unknown fields.
- The file contains no runtime logic; it is purely a shape definition. All enforcement happens in the consumer modules listed above.
- A comment at the top reminds maintainers to use relative imports (see `src/infrastructure/config/shared-rules/load.ts` for the convention).
