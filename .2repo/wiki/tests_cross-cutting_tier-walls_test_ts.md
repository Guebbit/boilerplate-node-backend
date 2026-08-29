# tests/cross-cutting/tier-walls.test.ts

## Purpose

Text-level cross-tier wall enforcement. While `eslint-plugin-boundaries` and `check:dependencies` validate the import *graph*, this suite scans raw source lines for tier names appearing in string literals, config arrays, or dynamic `import()` specifiers — forms that produce no graph edge and are therefore invisible to those tools. It also runs inside `npm test`, making violations visible to contributors before review.

## Key elements

- **`filesUnder(root)`** — Recursively collects `.ts` files under a tier directory; skips `tests/` subdirectories (co-located specs are exempt by design).
- **`isCommentLine(line)`** — Conservative regex: a line is exempt only if it *starts* as a comment (`//`, `/*`, `*`, `#`). Trailing comments on code lines are **not** exempt.
- **`spellings(tier)`** — Returns the two textual forms a tier appears in: the path-alias (`@modules/…`) and the repo-relative path (`src/modules/…`).
- **`crossings(tier, forbidden)`** — Core scanner. Reads every file in `tier`, filters out comment lines, and returns sorted `path:line → trimmed-line` strings for any line containing a forbidden tier's spelling.
- **Canary test** (`finds the source it means to sweep`) — Asserts minimum file counts per tier so a broken `SRC_ROOT` or renamed tier doesn't silently make every negative assertion pass.
- **Three wall tests** — Assert `crossings` returns `[]` for: infrastructure→{kernel,modules,app}, kernel→{modules,app}, modules→{app}.

## Relationships

No graph neighbors. The file imports only `node:fs` and `node:path`; it reads source files as plain text and has no runtime dependency on the code under test.

## Notes

- **Not a duplicate of boundary tools.** It deliberately catches a different failure mode (non-import textual references). Removing it does not make the boundary plugins redundant.
- **Comment exemption is intentional and narrow.** A `@see @modules/orders` in a kernel docblock is allowed (reader pointer, compiles to nothing). A string in a config array is *not* allowed (the loader resolves it at boot).
- **Trailing comments are still scanned.** `const target = '@modules/orders'; // the catalogue` will be flagged because the line does not *start* as a comment.
- **Co-located specs are invisible** to this scan (the `tests/` directory is pruned in `filesUnder`), matching the boundaries config's `spec` category exemption.
- **`SRC_ROOT`** is resolved relative to `__dirname/../../src`; if the test file is moved, the canary test will catch it via the file-count assertions.
