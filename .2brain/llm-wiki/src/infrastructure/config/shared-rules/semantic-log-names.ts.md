---
source: src/infrastructure/config/shared-rules/semantic-log-names.ts
source_sha256: 9ca60ad1c7f6cd6923600ef5f9e61c32a8591d815d741b53c57eb5f49bfdf792
context_sha256: 961f9030c41cb56fec10e82c7b43dfbd5b52b152fb44b40ad4cdb7022b1680a3
generated_at: 2026-11-22T02:46:43.133506+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/semantic-log-names.ts

## Purpose
Defines the Zod schema for `shared/rules/semantic-log-names.yaml`. That YAML file maps each field the code logs to the name that field is written with on a structured log line. The file holds only the schema, and its module doc comment states that it uses relative imports only.

## Key elements
- `semanticLogNamesSchema`: a `z.strictObject` with a single key, `semanticLogNames`. Its value is a `z.record` that maps a code field name to a log-line name.
  - Keys must be camelCase, matching `/^[a-z][A-Za-z0-9]*$/`.
  - Values must be non-empty strings (`z.string().min(1)`).
  - Because the object is strict, any other top-level key in the YAML is rejected.

## Relationships
- `registry.ts` is the neighboring file in `shared-rules/`. This file itself imports only `zod`, and nothing in its content references `registry.ts` directly.

## Notes
- Imports must stay relative (no path aliases), as the module doc comment states.
- The schema checks only key format and that values are non-empty. It does not check that the values are unique or that the keys correspond to fields actually logged.
