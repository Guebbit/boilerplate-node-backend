---
source: src/infrastructure/config/shared-rules/frontend-links.ts
sha256: 5a94edf75f03d6e7ddd5b92183d94874a41a6c0fd34044bbd4ff78c90a37d0dd
generated_at: 2026-10-29T01:58:43.022281+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/shared-rules/frontend-links.ts

## Purpose

Defines the Zod schema (and inferred TypeScript type) for `shared/rules/frontend-links.yaml`, which declares the frontend path templates that transactional e-mails and the sitemap link to, as well as the sitemap's static pages. It exists so that the shape of that YAML file is validated at load time rather than at runtime string-building.

## Key elements

- **`template`** (local) – Reusable Zod schema: a non-empty string, representing a single path template.
- **`frontendLinksSchema`** (exported) – `z.strictObject` with two keys:
  - `links` – a `strictObject` of ten path-template strings (`verify`, `reset`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`), each relative to the frontend's `/<locale>/` prefix.
  - `staticPages` – `z.array(z.string())`; the set of public pages that take no id. The empty string (`""`) denotes the home page.
- **`FrontendLinksRules`** (exported type) – `z.infer<typeof frontendLinksSchema>`; the TypeScript type of the parsed YAML.

## Relationships

- **`shared-rules/registry.ts`** – Registers `frontendLinksSchema` alongside the other shared-rule schemas so that `load.ts` can validate the YAML file in one pass.
- **`http/frontend-link.ts`** – Consumes a parsed `FrontendLinksRules` value to interpolate path templates into concrete URLs when building links for e-mails or the sitemap.

## Notes

- All link templates are **relative** to `/<locale>/`; the schema does not include the locale prefix or the site origin.
- `staticPages` uses the **empty string** to represent the home page—not `"/"`.
- The module doc-comment mandates **relative imports only** (see `shared-rules/load.ts` for the loader that enforces this convention).
- Both the top-level object and `links` use `z.strictObject`, so any extra key in the YAML file will cause a validation error rather than being silently ignored.
