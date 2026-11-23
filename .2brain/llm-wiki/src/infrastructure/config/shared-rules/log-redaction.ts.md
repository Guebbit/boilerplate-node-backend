---
source: src/infrastructure/config/shared-rules/log-redaction.ts
source_sha256: 7b61b6bae6e4a135ad38497a36919f8fc94b6eaae0055c77897719b95a24f470
context_sha256: 07cb00d0ba0a3690fdf173a89f2ade4344c123fed2f7a2aaf24c4fd6b01c28b2
generated_at: 2026-11-22T02:45:40.309780+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/log-redaction.ts

## Purpose
Defines the Zod schema for `shared/rules/log-redaction.yaml`, the rules file that says which log keys are credentials, which are personal data, and which URL query parameters trace spans may not carry. It describes the shape of the data only. It holds no rule values and no redaction logic.

## Key elements
- `logRedactionSchema`: a `z.strictObject` with four required fields. Unknown keys are rejected.
  - `sensitiveFields`: exact key names (after normalisation) whose values are replaced and never logged.
  - `sensitiveKeyFragments`: fragments that make a key sensitive wherever they appear in it.
  - `personalFields`: personal-data keys, hashed by default rather than dropped.
  - `traceUrlSecrets`: query parameters that a span's URL attributes may not carry in clear.
- `names` (internal, not exported): a non-empty array of non-empty strings, used by all four fields.

## Relationships
- `registry.ts` (same folder) is a neighbor in the dependency graph. The schema is presumably registered and validated there.
- `logger.ts` and `otel-sdk.ts` are neighbors, and the field docs match their purposes. The logger would use the key and personal-data lists, and the OTel SDK would use `traceUrlSecrets` for span URL attributes. This file does not import either of them.

## Notes
- The module doc says it must use relative imports only, for reasons given in `load.ts` in the same folder.
- Every list must have at least one entry, so an empty list in the YAML fails validation.
