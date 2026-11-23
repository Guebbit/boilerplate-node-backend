---
source: shared/cases/permission-model-version.cases.yaml
source_sha256: cf3a911e437ae52203c5770a6760d93fcf6aed9d612bfa1c7524b2dde25273f2
context_sha256: ef1bf1698bf4a1ea79816a060f34fead9b1e78ea57bd5c822f7c218473544425
generated_at: 2026-11-22T02:21:59.490070+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/permission-model-version.cases.yaml

## Purpose
Shared test-case fixtures for computing a "permission-model version": the number a client uses to key its cached permission rules. The version is the first 4 bytes of `sha256(sorted rule ids joined by "\n")`, read as a big-endian unsigned integer. Because the cases are language-neutral data, multiple implementations ("twins") can be checked against the same expected values.

## Key elements
- `cases` — a list of entries, each with:
  - `name` — description of what the case checks.
  - `ids` — list of rule id strings (for example `'read:Product'`).
  - `version` — the expected unsigned 32-bit result.
- Covered scenarios:
  - Three ids producing `4161510200`.
  - The same set in a different order producing the same `4161510200` (order independence).
  - An empty set producing `3820012610` (hash of the empty string).
  - A single id `['a']` producing `3398926610` (no separator is added).
  - A non-ASCII id set `['ä', 'z', 'a']` producing `4167311475` (sorts after ASCII, hashed as UTF-8).

## Relationships
- `shared/authorization-keys.generated.yaml` is the only graph neighbor. Rule ids such as `read:Product` and `update:Product` look like the kind of keys it would hold, but the file content here does not show any direct reference or import between the two.

## Notes
- Sorting is by UTF-16 code unit (JavaScript's default). All ids in these cases are BMP text, where that order equals byte order. A twin may therefore sort by either, and the cases won't tell the two apart.
- The `ä` case is the only one that exercises non-ASCII handling. Implementations must hash the joined string as UTF-8.
