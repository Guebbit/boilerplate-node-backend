---
source: scripts/eslint/comment-links.ts
source_sha256: 6ce228977886a0a241a523e96ff5a3b1ca0540106ad9b58118fec482eeb623db
context_sha256: daff9a26dfeb1145749d4cfc829951355cbc799c840941a7fef335ecadad5cdd
generated_at: 2026-11-22T02:05:43.242471+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/comment-links.ts

## Purpose
Defines a custom ESLint rule, `commentLinks`, that flags comments citing a `.ts`/`.tsx` file that no longer exists. It keeps comment references from rotting after renames or removals. ESLint's AST does not include comments, so the rule walks the token stream via `context.sourceCode.getAllComments()`.

## Key elements
- `commentLinks`: the exported rule, built with `ESLintUtils.RuleCreator.withoutDocs`. It is a `problem`-type rule with no options and a single message id, `stale`. On `Program`, it scans every comment and reports any unresolved reference at the comment's location.
- `URL_LIKE`: regex used to blank out URLs (`scheme://…`, `www.…`) before scanning, so external links are never checked.
- `TS_SEGMENT` / `TS_REFERENCE`: regexes that match a `.ts`/`.tsx` path. A segment is either an ordinary word or a `<placeholder>`. Placeholders are built into the regex, so a path whose segments include a placeholder (for example a module path with a `<name>` segment) is captured whole rather than leaving a dangling trailing filename.
- `targets()` / `targetsCache`: lazily calls `trackedTargets(ROOT)` once per lint run and caches the result (the tracked-file set plus its roots).
- `resolvesTsReference(reference, filename)`: decides whether a reference is valid:
  - A reference containing `<` is always valid.
  - A `./` or `../` reference is resolved against the directory of the file the comment lives in, using `existsSync`.
  - Anything else is valid if the path doesn't claim a repo path (`claimsAPath`), is on the allowed gitignored-but-real list (`allowedPathPrefix`), or matches a tracked file by suffix (`resolves`).

## Relationships
- `scripts/docs/repo-references.ts`: supplies the shared resolution machinery (`allowed`, `trackedTargets`, `resolves`, `claimsAPath`), which the file's own comments say is also used to check references in `docs/*.md`.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, which is passed to `trackedTargets`.
- `scripts/eslint/index.ts`: a sibling in the ESLint scripts folder. It is presumably where this rule is registered; that is not visible in this file.
- `tests/unit/scripts/eslint/comment-links.test.ts`: the unit test for this rule.

## Notes
- External URLs are exempt, because a link to a `.ts` file elsewhere is what the third-party-code rule asks for and the repo can't control whether it rots.
- Markdown or plan-doc references are deliberately not checked. `.gitignore` keeps such docs out of the repo, and a pattern that caught every way a doc can be named would refuse ordinary prose.
- The `stale` message tells authors to fix the reference or wrap the varying part in `<angle-brackets>`.
- The matching path is a suffix match against tracked files, not an exact path, except for `./`/`../` references, which are resolved against the actual file on disk.
- The cache is module-level and never invalidated, so it is not refreshed during a long-lived process such as an editor ESLint server.
