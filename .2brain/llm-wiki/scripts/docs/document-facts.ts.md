---
source: scripts/docs/document-facts.ts
sha256: c917ea6cbf8b975e15c8125920c83f2a576d8b7bd1775bcfc324294878501aa6
generated_at: 2026-11-14T17:31:29.033354+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/document-facts.ts

## Purpose

Pure text-checking module that extracts `npm run <script>` citations from docs markdown and reports which cited scripts do not exist. It exists so that `check-references.ts` can delegate the "what does this page claim?" logic to a unit-testable, side-effect-free set of functions.

## Key elements

- **`DocumentPage`** (interface) — a page's repo-relative `path` and its markdown `text`; the unit every finding is reported against.
- **`FactFinding`** (interface) — one failed claim: the `page` path and a one-line `problem` description.
- **`npmScriptsCited(text: string): string[]`** — scans markdown (inline or fenced) for `npm run <name>` occurrences via regex, strips trailing colons (prose punctuation like `test:*`), and returns the deduplicated list of script names.
- **`missingScripts(pages, known): FactFinding[]`** — flat-maps over every page, filters `npmScriptsCited` results against the caller-supplied `known` set, and emits one `FactFinding` per unknown script.

## Relationships

- **`scripts/docs/check-references.ts`** — caller/supplier: it reads the docs pages, builds the `known` script-name set, passes both into `missingScripts`, and handles reporting the returned findings.
- **`tests/unit/scripts/docs/document-facts.test.ts`** — unit-tests the two exported functions (`npmScriptsCited`, `missingScripts`) in isolation.

## Notes

- The module is intentionally **pure** (no file I/O, no config reads); all inputs arrive as parameters.
- The regex `/\bnpm run ([\w.:-]+)/g` matches scoped and dotted names (e.g. `docs:build`, `test:unit`) and the subsequent `.replace(/:+$/, '')` handles prose like "run `npm run test:*`" where a trailing colon is punctuation, not part of the script name.
- `npmScriptsCited` uses a `Set` to deduplicate, so a script cited multiple times on one page yields a single entry.
