---
source: shared/rules/schemas/jobs.generated.schema.json
source_sha256: 0c47f4aa4c3adc93b3d3915d5eee01224985ba910e44dfee657ea8891e8dcd89
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:46.736663+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/jobs.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) describing a document of scheduled jobs. It validates a top-level `jobs` map where each entry declares a job's name, cron-style schedule, and a human-readable summary.

## Key elements
- **Root object**: requires a single `jobs` property; no other top-level properties are allowed (`additionalProperties: false`).
- **`jobs`**: an object whose keys are arbitrary strings and whose values are job definitions.
- **Job definition** (all three fields required, no extra fields allowed):
  - `name`: string matching `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$`, i.e. a `reap:` or `sweep:` prefix followed by a lowercase kebab-case slug (e.g. `sweep:stale-sessions`).
  - `schedule`: string matching `^[\d*/,-]+(\s+[\d*/,-]+){4}$`, i.e. five whitespace-separated fields made up only of digits, `*`, `/`, `,`, and `-` (cron-like).
  - `summary`: non-empty string (`minLength: 1`).

## Relationships
None. The graph shows no neighbors, so no consumers or generators are identified from this file alone.

## Notes
- The `.generated` suffix indicates it is produced by tooling. Edit the source rather than this file; the source is not identified here.
- The schedule pattern checks only the character set and field count. It does not check value ranges, so `99 99 99 99 99` would pass. Named values such as `MON` or `@daily` are rejected.
- The `jobs` map keys are not tied to `name`. The schema does not require them to match.
