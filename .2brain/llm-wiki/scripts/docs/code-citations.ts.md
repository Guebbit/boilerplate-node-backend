---
source: scripts/docs/code-citations.ts
source_sha256: 6364311059f187a5f6fc4582cb9e71da131fce0dc4c308d54d964ca4a49d6601
context_sha256: 8534e305c2a0dc6fc924b299d20d6e8929459690d6406d1adb2d93ee27263804
generated_at: 2026-11-22T02:01:53.224908+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/code-citations.ts

## Purpose
Finds dead `docs/…` links cited *outside* `docs/` (source, tests, scripts, configs, root docs, YAML, `.env-example`). It resolves citations the way `check-references.ts` resolves a page's own citations. It checks that the cited page is tracked and that any `#anchor` is a real heading of that page. It does not judge wording, coverage, or the number of citations.

## Key elements
- `headingSlugs(markdown)` — returns the set of anchors a page supports. It uses VitePress's `slugify` from `@mdit-vue/shared` on the heading's plain text (link targets, backticks and `*` stripped). Repeated headings get `-1`/`-2` suffixes, explicit `{#custom-id}` anchors are honored, and `#` lines inside ``` or ~~~ fences are ignored.
- `deadCodeCitations(root, files)` — scans every tracked citing file for `docs/….md[#anchor]` citations. It returns one `file: citation` line per dead link, in file order. A citation is dead if the page is not a tracked `docs/*.md` file or the anchor is not among the page's slugs. Slugs are parsed once per page and cached.
- `anchorlessSeeTags(root, files)` — returns `file:line: page` entries for docblock `@see docs/<page>.md` tags that have no `#anchor`. It covers JS/TS files only.
- `CITATION` (internal) — the regex that matches a citation. Its lookbehind rejects paths glued to a longer path or URL.
- `ANCHORLESS_SEE` (internal) — matches a `@see` on a ` * ` line or in a one-line `/** … */`.
- `isCitingFile` / `citingText` (internal) — decide which files are scanned and read their text.

## Relationships
- `check-references.ts` is the checker whose resolution rules this file mirrors for citations outside `docs/`.
- `tests/unit/scripts/docs/code-citations.test.ts` is the unit test for these exports.
- `tests/unit/scripts/docs/document-facts.test.ts` and `tests/unit/scripts/mutation/ci/waves.test.ts` are listed as graph neighbors. Their interaction with this file is not visible here, though the fixture marker exists for test files whose `docs/…` strings are checker inputs.

## Notes
- **Scanned files:** files under `src/`, `scripts/`, `scenarios/`, `tests/`, `docker/` and `.claude/`. Also top-level `*.md` and `*.js/ts/cjs/mjs/cts/mts` files, any `.yml`/`.yaml`, and `.env-example`, `.gitignore` and `.gitattributes`. `docs/` and `.2brain/` are excluded.
- **Skipped citations:** URLs, `../`-relative paths and a peer repo's `<dir>/docs/…` are not matched. A leading `./` is allowed.
- **Fixture opt-out:** a test file under `tests/` whose text starts with `// citation-fixture:` is skipped entirely. The marker has no effect in other directories, so a `src/` file that carries it is still scanned.
- **Trailing punctuation:** `.:!?` after an anchor is stripped before lookup, and the anchor is passed through `decodeURIComponent`. An anchor with malformed percent-encoding would make `decodeURIComponent` throw. The code has no guard for this.
