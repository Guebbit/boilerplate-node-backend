# tests/cross-cutting/docs-match-the-tree.test.ts

## Purpose

Validates that the specific numbers (line counts) and paths (file citations, controller names) published in `docs/theory/` pages still match the actual codebase. It exists because prose that cites concrete metrics rots silently when code changes on a different commit—this test makes that rot a test failure instead of a quiet lie on the page.

## Key elements

- **`tablesIn(markdown)`** — Extracts all well-formed markdown tables (header + separator + rows) from a page string. Discovered structurally, not by heading, so moving a section doesn't break the parse.
- **`paragraphsIn(markdown)`** — Splits a page into blank-line-separated blocks.
- **`onDisk(cited)`** — Resolves a cited path to its filesystem location. Paths not starting with `src/` are resolved relative to `src/modules/`; the rest resolve from repo root.
- **`lineCount(file)`** — Counts newlines in a file, matching `wc -l` semantics.
- **`publishedCounts()`** — Parses the over-threshold table in `layers.md` into `{ cited, lines }` pairs.
- **`claimedOverThreshold()`** — Extracts the word-number (one–ten) from the sentence that introduces that table.
- **`unparsedEndpointClaims()`** — Locates paragraphs in `request-flow.md` that mention both "generated schema" and "endpoints."
- **`controllersNamedAsUnparsed()`** — Extracts backticked tokens matching the repo's `<verb>-<name>` controller naming convention from those paragraphs.
- **`controllersOnDisk()`** — Lists every controller basename under `src/modules/*/controllers/`.
- **`claimedUnparsedEndpoints()`** — Extracts the word-number count from the endpoints claim sentence.
- **`describe("the service sizes layers.md publishes")`** — Four tests: canary (parser found the table), cited files exist, line counts match, row count matches the claimed word-number.
- **`describe("the controllers request-flow.md names")`** — Canaries plus checks that named controllers exist on disk and the claimed count matches.

## Relationships

No dependency-graph neighbors. The test reads two documentation files (`docs/theory/layers.md`, `docs/theory/request-flow.md`) and the `src/modules/` tree at runtime; it imports nothing from the application source.

## Notes

- **Canary-first pattern:** Every `describe` block opens with a test asserting the parser found at least one target. Without it, a reworded sentence would make the parser return an empty list, every subsequent check would pass vacuously, and the guard would be silently disabled.
- **Number words are capped at ten.** `NUMBER_WORDS` maps one–ten. A page that claims eleven modules would need a new entry added here.
- **Deliberately does not validate prose descriptions.** Whether a paragraph fairly characterizes a service's responsibilities is a judgment call; this test only checks mechanically verifiable facts (numbers, paths, names).
- **Controller-name extraction relies on the repo's naming convention** (`<http-verb>-<hyphenated>`, enforced by `controller-naming.test.ts`). A controller named outside that pattern would be invisible to `controllersNamedAsUnparsed()`.
- **Line count is newline-based, not visual-line-based**, so a file with a trailing blank line counts one more than a reader's editor might show.
