---
source: shared/rules/schemas/frontend-links.schema.json
sha256: 0ff3e144da75e51b2c77e92ea07d9be12afd6ddc507a53514b448ead16a863a4
generated_at: 2026-10-29T01:48:12.830938+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/frontend-links.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates the shape of a frontend-links configuration object. It enforces that every required navigation/action route key is present, non-empty, and that no undocumented keys are added. It also validates an accompanying list of static pages. This exists so that any tooling or validation step can check frontend link configuration files against a single source of truth.

## Key elements

- **Top-level object** — requires `links` and `staticPages`; disallows additional properties.
- **`links`** (object, required) — a closed set of ten route keys, each a non-empty string (`minLength: 1`), and `additionalProperties: false`:
  - `verify`, `reset`, `restore` — account-related action routes.
  - `emailChange`, `emailUndo` — email-management action routes.
  - `export`, `order`, `product`, `contact`, `privacy` — standard site routes.
- **`staticPages`** (array of strings, required) — a free-form list of additional static page identifiers.

## Relationships

No graph-neighbor files were reported for this schema. It is a standalone validation artifact; consumers would reference it at runtime or in CI rather than importing it as a module.

## Notes

- The `links` object is fully closed (`additionalProperties: false` at both the `links` level and the top level), so adding a new route key requires updating this schema.
- Every `links` key is both in `properties` and in `required`; omitting any one will fail validation.
- `staticPages` has no `minLength`, `minItems`, or uniqueness constraint—any array (including an empty one) is valid.
- The schema does not constrain the *format* of the route strings beyond "non-empty" (no `pattern`, `format`, or `uri` constraint), so values like `"#"` would pass.
