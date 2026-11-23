---
source: scripts/contracts/fill-enum.ts
source_sha256: f2eaca78c07cc60b9f8dd8f0f6da18748564a98e969732babbf0147b4802a664
context_sha256: 0dd67ed20346922778015b22b3ca05e58f4fef03be310a2ae903b3203206ec8a
generated_at: 2026-11-22T01:55:39.246872+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/fill-enum.ts

## Purpose
A post-bundle step that fills `enum` values into OpenAPI schemas that declare them by name rather than by value. A fragment marks a schema with `x-enum-from: <source>`, and the bundler replaces the marker with the values from a list supplied elsewhere (e.g. webhook event names taken from each module's `asyncapi.webhooks.yaml`). This avoids copying lists into contract files, where they would drift.

## Key elements
- `EnumSources`: type, a readonly record of source name to readonly string list. It is the set of lists the bundler can fill from.
- `withFilledEnums(document_, sources)`: the only runtime export. It mutates the bundled `OpenApiDocument` in place, filling every `x-enum-from` schema.
- `enumFor` (internal): computes the final enum for one placeholder, validating it and throwing `[openapi] <where>: …` errors.
- `fillIn` (internal): walks the document depth first, in place. It replaces each placeholder's `enum`, deletes `x-enum-from` and `x-enum-also`, and returns the number filled.
- `isOwnName` (internal): true only when the node is a whole component schema (`#/components/schemas/<Name>`) and the marker value equals that schema's name.
- `isStringList` (internal): type guard for string arrays.

## Relationships
- `./openapi-document`: supplies the `OpenApiDocument` type that `withFilledEnums` takes.
- `./openapi-bundle`: calls `withFilledEnums`, passing the sources object. Adding a new source means adding one entry there.
- `tests/unit/scripts/contracts/fill-enum.test.ts`: the unit test for this module.
- `./openapi-extensions` and `x-extends` are mentioned in the docs only. They are the mechanism by which a module extends another module's open enum.

## Notes
- Resulting enum order is: hand-written values, then the source's values, then `x-enum-also`.
- With a hand-written `enum` alongside the marker, the marker means append. An unknown source is then allowed only if the marker equals the schema's own component name, which models an extender that is gone, and it appends nothing. Any other unknown name, including an inline property that merely shares the name, throws.
- Errors are thrown for:
  - an unknown source with no written enum;
  - an empty source with no written enum;
  - a written `enum` or `x-enum-also` that is not a list of strings;
  - duplicate values in the final enum.
- Source lookup uses `Object.hasOwn`, so inherited keys do not count as sources.
- Nothing in the file knows any source by name.
