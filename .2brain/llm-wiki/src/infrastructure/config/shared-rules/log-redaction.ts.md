---
source: src/infrastructure/config/shared-rules/log-redaction.ts
sha256: 62d95c207b19a5bd39b521f0607870900a66732a4b6ec5aa9f7975d374b45f76
generated_at: 2026-11-08T03:26:59.602166+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/log-redaction.ts

## Purpose

Defines the Zod validation schema (and inferred TypeScript type) for `shared/rules/log-redaction.yaml`, the configuration file that declares which log keys are sensitive, which are personal data, and which URL query parameters must not appear in trace span attributes.

## Key elements

- **`names`** (module-private) — Reusable Zod schema: a non-empty array of non-empty strings. Used by every field in the main schema.
- **`logRedactionSchema`** (exported) — A `z.strictObject` with four keys, all typed as `names`:
  - `sensitiveFields` — Exact (normalised) key names whose values are dropped entirely from logs.
  - `sensitiveKeyFragments` — Substring fragments; any key *containing* one of these is treated as sensitive.
  - `personalFields` — Keys holding personal data; hashed by default rather than dropped.
  - `traceUrlSecrets` — URL query-parameter names that must not appear in clear in a span's URL attributes.
- **`LogRedactionRules`** (exported type) — `z.infer<typeof logRedactionSchema>`; the runtime-validated shape of the parsed YAML.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Registers `logRedactionSchema` alongside other shared-rule schemas so it can be validated on load.
- **`src/infrastructure/adapters/logger.ts`** — Consumes the parsed `LogRedactionRules` to decide which keys to drop, fragment-match, or hash when formatting log output.
- **`src/infrastructure/runtime/otel-sdk.ts`** — Reads `traceUrlSecrets` to strip those query parameters from span URL attributes before they are exported.

## Notes

- The schema is `strictObject`: any extra top-level key in the YAML causes a parse failure rather than being silently ignored.
- The file docblock mandates **relative imports only** (see `src/infrastructure/config/shared-rules/load.ts`); do not introduce package-name or absolute-path imports here.
- `sensitiveFields` and `sensitiveKeyFragments` are both present on purpose: the former is an exact-match list (after normalisation), the latter is a substring/fragment match. They are not redundant.
