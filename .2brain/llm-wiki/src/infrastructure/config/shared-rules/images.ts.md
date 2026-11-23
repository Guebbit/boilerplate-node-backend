---
source: src/infrastructure/config/shared-rules/images.ts
source_sha256: 7d4e0aaab83953cbb85fdff45e40f340d0d50bb074dff60499dc87271d7d9f67
context_sha256: f618544957dfde5821e1c9b775cfb10e9fb92d5294521a3fb3c5e28ce31b1ede
generated_at: 2026-11-22T02:45:15.151587+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/images.ts

## Purpose
Defines the Zod schema for `shared/rules/images.yaml`. The YAML lists the accepted image formats, each identified by its leading bytes ("magic numbers"), plus the version segment used in thumbnail paths. The schema validates that rules file when it is loaded.

## Key elements
- `imagesSchema` (exported): a strict object with a single `images` key containing:
  - `thumbnailVersion`: string matching `^v[0-9]+$` (a `v` followed by digits).
  - `formats`: non-empty array of image format entries.
- `imageFormatSchema` (internal): one accepted format, with these fields:
  - `mime`: must match `image/...`.
  - `aliases` (optional, non-empty): other `Content-Type` spellings clients send, also `image/...`.
  - `offset` and `bytes`: where the main signature starts, and its bytes (0–255, at least one).
  - `extension`: lowercase alphanumeric, stored without the dot.
  - `alsoRequires` (optional, non-empty): extra markers that must also match.
  - `reencodable`: boolean saying whether the digest job can re-encode the format.
- `markerSchema` (internal): an `offset` (≥ 0) plus a non-empty `bytes` array (0–255).

## Relationships
- `registry.ts` is a neighbor in the same `shared-rules` directory. It presumably registers or consumes this schema, but that is not visible in this file.
- `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` is the unit test file for the ops rules schemas, which likely includes this one.

## Notes
- All objects are `strictObject`, so an unknown key is rejected. The comments say an extra key is either a typo or behaviour that belongs in code, not in the data file.
- A `refine` on the `images` object rejects the file if any MIME type or alias appears more than once. It checks across all formats, and an alias cannot repeat a `mime`. The error message is `a MIME type or alias is listed twice`.
- The `thumbnailVersion` regex deliberately uses `[0-9]` instead of `\d`. An `eslint-disable` comment explains that the pattern is written into the shared JSON schema read by "the twin", so the explicit ASCII class is kept.
- The module header says it uses relative imports only, and points to `load.ts` for the reason.
