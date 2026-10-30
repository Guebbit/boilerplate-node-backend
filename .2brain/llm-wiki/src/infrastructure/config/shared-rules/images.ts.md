---
source: src/infrastructure/config/shared-rules/images.ts
sha256: 082110545161fdb4df8b9d68fb55c1bfc1a73873d35463bd484cd7dfcea22afe
generated_at: 2026-10-29T01:59:04.418090+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/images.ts

## Purpose

Defines the Zod validation schemas for `shared/rules/images.yaml`: the set of accepted image formats (identified by magic bytes at known offsets), their MIME aliases, storage extensions, re-encodability flag, and the thumbnail version segment. It exists so that a malformed rules file is caught at load time rather than at request time.

## Key elements

- **`markerSchema`** *(private)* — Validates a single additional byte-signature entry: `{ offset: int ≥ 0, bytes: int[1..255][] (min 1) }`.
- **`imageFormatSchema`** *(exported)* — Validates one accepted format: MIME type, optional `aliases`, primary `offset` + `bytes`, storage `extension`, optional `alsoRequires` (array of `markerSchema`), and `reencodable` boolean.
- **`imagesSchema`** *(exported)* — Validates the full YAML shape: `{ images: { thumbnailVersion: "v<number>", formats: imageFormatSchema[] (min 1) } }`. Includes a `.refine` that rejects the config if any MIME type or alias appears more than once across all formats.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports `imagesSchema` and registers it alongside the other shared-rule schemas so the loader can validate `images.yaml` against this contract.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Exercises `imagesSchema` and `imageFormatSchema` with valid and invalid fixtures, including the duplicate-MIME refinement.

## Notes

- All objects use `z.strictObject`, so any unexpected key in the YAML is a hard validation error. The file docblock frames this as intentional: an extra key is either a typo or behaviour that belongs in code, not config.
- The duplicate-check refinement flattens **both** `mime` and `aliases` across every format into one flat list before building a `Set`. A MIME type that is the `mime` of one format and an `alias` of another will also be rejected.
- `thumbnailVersion` is constrained to `^v[0-9]+$` (e.g. `v1`, `v23`); it is a path segment, not a semver.
- The module docblock notes the relative-imports-only convention inherited from `shared-rules/load.ts`.
