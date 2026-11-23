---
source: scripts/docs/document-facts.ts
source_sha256: 6ffd63d9d8849505fa6071cc53d11aa3e37342d9f813cd2da3d5701672427785
context_sha256: 73fb260d104bf8e8762f0a09fc8e21a6f45c665ebf0f10991bed18f82bd5cae0
generated_at: 2026-11-22T02:02:18.787303+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/document-facts.ts

## Purpose
Pure, text-in/findings-out checks for facts a docs page states about `package.json`. It verifies that every `npm run <x>` a page cites is a real script, and that every page opens with a valid front-matter `type` and `audience`. It does no I/O itself; `check-references.ts` supplies the pages and script names and reports the results.

## Key elements
- `DocumentPage` — `{ path, text }`: a page's repo-relative path and its markdown.
- `FactFinding` — `{ page, problem }`: one failed claim and the page it is on.
- `npmScriptsCited(text)` — returns the distinct script names after `npm run` (inline or fenced). Matches `[\w.:-]+` and strips trailing `:` characters, which count as prose punctuation (e.g. `npm run test:*`).
- `missingScripts(pages, known)` — one finding per page and cited script that is not in the `known` set, with the problem `` `npm run X` is not a script ``.
- `missingFrontMatter(pages)` — one finding per page and problem when front-matter is absent, or `type` or `audience` is invalid. The page whose path is exactly the `HOME_PAGE` constant (the landing layout) is exempt.
- Internal constants:
  - `PAGE_TYPES`: `concept`, `task`, `reference`, `troubleshooting`.
  - `AUDIENCES`: `staff`, `owner`, `developer`, `architect`, `operator`, `anyone`.
  - `HOME_PAGE`: the one page treated as a landing layout rather than content, exempt from the front-matter check.
- Internal helper `frontMatterOf(text)` — parses the leading `---` block with `yaml`. It returns `undefined` if there is no block, `{}` if the block is not a mapping, and otherwise the parsed keys.

## Relationships
- `scripts/docs/check-references.ts` is the caller. Per the module header, it supplies the pages and the known script names and reports the findings.
- `tests/unit/scripts/docs/document-facts.test.ts` is the unit test for these checks.
- `src/infrastructure/config/fields.ts` is a graph neighbor, but this file shows no direct interaction with it.

## Notes
- `known` is meant to cover scripts defined in this repo and in the paired frontend, because the docs cite both.
- `type` must be a string in `PAGE_TYPES`. `audience` must be a non-empty array, and every entry must be in `AUDIENCES`. A single string `audience` fails.
- A missing front-matter block yields one finding (`no front-matter block (type, audience)`). A block that exists but is invalid can yield up to two findings, one for `type` and one for `audience`.
- Front-matter must start at the very beginning of the text (`^---`).
- The module header points to a style-guide section on what the references check sweeps, but that document is not part of this repository's files.
