---
source: shared/rules/schemas/defaults.generated.schema.json
source_sha256: 6269ee07d5a6af20200f70afa52b2fab6a558894a7e4e1b9f2275cbfc4319ec0
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:25.251415+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/defaults.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) describing the shape of a `defaults` configuration object. It defines the required keys and value constraints for shared default limits and settings (response cache, idempotency, pagination, images, uploads). The `.generated` name suggests it is produced by tooling rather than edited by hand.

## Key elements
All leaf values are integers with a maximum of `9007199254740991`. The root object requires `defaults` and disallows extra keys, as does every nested object.

- `defaults.responseCache`
  - `devTtlMaxSeconds`: integer, `>= 0`.
  - `maxBytes`: integer, `> 0`.
- `defaults.idempotency`
  - `retentionHours`: integer, `> 0`.
- `defaults.pagination`
  - `pageSize`: integer, `> 0`.
- `defaults.images`
  - `maxInputPixels`: integer, `> 0`.
  - `maxDimension`: integer, `> 0`.
  - `thumbnailDimension`: integer, `> 0`.
  - `quarantineRetentionHours`: integer, `> 0`.
- `defaults.uploads`
  - `maxBytes`: integer, `> 0`.

## Relationships
No graph neighbors are listed, so no dependencies or consumers are visible from this file alone.

## Notes
- Every property in every object is `required` and `additionalProperties` is `false`, so the schema is strict: missing or unknown keys fail validation.
- `devTtlMaxSeconds` is the only field that permits `0`. All other fields must be strictly positive.
- The `minimum`/`exclusiveMinimum` and `maximum: 9007199254740991` pattern looks like the output of a schema converter, likely from Zod. This is an inference from the style, not something the file states. Changes should likely be made in the source definition and then regenerated, not in this file.
