# docs/theory/glossary.md

## Purpose

Defines the ubiquitous language of every bounded context (module) in the codebase, with each term scoped to the module that owns it. It exists to make explicit the meaning and constraints behind domain terms that identifiers alone cannot carry, and to enforce the DDD principle that the same word may legitimately mean different things in different contexts.

## Key elements

- **Per-module term tables** — Each section (`account`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`, `payments`, `products`, …) presents a two-column table: the term and its meaning *in that module only*.
- **Deliberate divergence** — The same word is intentionally given different definitions across modules (e.g., "Soft delete" in `products` vs `users`) rather than being collapsed into one entry.
- **Tip callout** — Points out that the real ubiquitous language lives in code identifiers; this page supplies the semantic layer an identifier cannot express.
- **Cross-reference** — Links to `strategic-ddd.md#_3-ubiquitous-language-per-context-not-per-app` for the rationale behind per-context (not per-app) language boundaries.

## Relationships

- **`docs/theory/index.md`** — This glossary is listed as one of the theory pages in the section index; it is a leaf document that the index points to.
- **`docs/theory/strategic-ddd.md`** — The glossary explicitly defers to this file for *why* language is scoped per bounded context. The strategic DDD page provides the theoretical justification; the glossary is the concrete application of that rule.
- **`docs/theory/layers.md`** — The glossary's module list (`account`, `cart`, `inventory`, `orders`, `payments`, `products`, etc.) mirrors the layer/context boundaries that `layers.md` describes structurally. The glossary is the language-level counterpart to the structural documentation.

## Notes

- The glossary is **not** a code artifact; it has no exports, classes, or runtime behavior. It is purely a reference document.
- The `products` section is truncated in the current content snapshot; additional modules may be present in the full file.
- Conventions used in definitions: bold for the term, backticks for code identifiers, and parenthetical file pointers (e.g., `domain/rates.ts`, `domain/transitions.ts`, `domain/lifecycle.ts`) to anchor a definition to a specific source file.
- The file uses the `::: tip` callout syntax (VitePress / Docusaurus), so it is expected to be rendered in a documentation framework, not read as raw Markdown in isolation.
