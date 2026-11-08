---
source: src/infrastructure/config/shared-rules/frontend-links.ts
sha256: 8dc91f9cad1d1bb51e801e0362dab1d09786b25dff2254603972892a9d97c4e4
generated_at: 2026-11-08T03:26:10.188354+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/frontend-links.ts

## Purpose

Defines the Zod schema that validates `shared/rules/frontend-links.yaml`. That YAML file is the single source of truth for every frontend path the backend links to in transactional mail (verification, reset, orders, etc.), staff-screen URLs in work-notice mail, and the sitemap's static-page list. The schema exists so the YAML is type-checked at load time rather than at runtime string-concatenation time.

## Key elements

- **`frontendLinksSchema`** (exported) — `z.strictObject` with three top-level keys:
  - `links` — ten path templates (verify, reset, restore, emailChange, emailUndo, export, order, product, contact, privacy) all relative to the frontend's `/<locale>/` prefix.
  - `staffPages` — fifteen path templates for internal staff screens (per-entity screens and summary/tab rows like `transfersDue`, `lowStock`, `staleRefunds`, etc.).
  - `staticPages` — `z.array(z.string())`; public pages that take no id (empty string = home page).
- **`FrontendLinksRules`** (exported) — `z.infer` type of the schema; the shape of a successfully parsed YAML document.
- **`template`** (module-local) — shorthand `z.string().min(1)`, enforcing non-empty path strings.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — registers `frontendLinksSchema` (alongside other shared-rule schemas) so the loader can parse and cache the YAML in one pass.
- **`src/infrastructure/http/frontend-link.ts`** — consumes a `FrontendLinksRules` value (typically the `links` or `staffPages` slice) to resolve a concrete URL for a given locale and dynamic id when composing outbound mail or sitemap entries.

## Notes

- All path templates are **relative** to the frontend's `/<locale>/` prefix; the consuming code in `frontend-link.ts` is responsible for prepending that prefix.
- The schema is a `strictObject` at every level — unknown keys in the YAML will fail validation rather than being silently ignored.
- The file's JSDoc explicitly forbids relative imports beyond what `src/infrastructure/config/shared-rules/load.ts` already provides; do not add new import paths here.
