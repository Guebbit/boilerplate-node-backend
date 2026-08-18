#!/usr/bin/env tsx
/**
 * Fails when a doc names a source file that does not exist — `npm run check:doc-paths`.
 *
 * Docs in this repo cite paths constantly, and a path is the one part of a sentence that stops
 * being true without anyone editing it. A reorganisation moves the file, every prose reference to
 * it silently becomes a dead end, and nothing reports it: the build passes, the tests pass, and
 * the reader is the one who finds out. The analytics split alone left nine of them behind across
 * three pages, and they were found by hand rather than by anything that runs.
 *
 * ── WHY IT RESOLVES AGAINST THE FRONTEND TOO ─────────────────────────────────────────────────
 * Some of the paths in these docs deliberately name files in the PAIRED FRONTEND — where a
 * published bundle lands, what its mocks read. A checker that only knew about this repo would
 * flag every one of them, and a gate that cries wolf is a gate somebody turns off within a week.
 *
 * So a path counts as resolved if it exists HERE or THERE, and no new prose syntax is needed to
 * tell them apart. The cost is a real one and worth stating: a backend path that also happens to
 * exist in the frontend passes even when this repo's copy has moved. Both repos are laid out the
 * same way deliberately, so that overlap is largest exactly where it matters. It is accepted
 * because the alternative — annotating every cross-repo reference by hand — is the kind of
 * bookkeeping that rots faster than the thing it documents.
 *
 * ── WHY A MISSING SIBLING IS NOT FATAL LOCALLY, AND IS IN CI ─────────────────────────────────
 * Same rule as `check-spec-identity.ts`, for the same reason: a half-cloned pair should still be
 * able to commit. Without the frontend on disk every cross-repo path would report as broken, so
 * the check runs in THIS-REPO-ONLY mode and says so, rather than producing a list that is mostly
 * noise. Under `CI` a missing sibling is a misconfigured workflow, so it fails instead.
 *
 * The mirror of `scripts/check-document-paths.ts` in the frontend — the same idea pointed the
 * other way. Not a byte-identical copy, and deliberately not in `SHARED_FILES`: each names its
 * own sibling and its own top-level directories, exactly as `specIdentity.ts` does.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_FRONTEND_PATH, resolveFrontendPath } from './frontendPath';

/**
 * Backtick spans that look like a repo path: a known top-level directory, then a filename with an
 * extension. The extension is what keeps `src/modules/` and other bare directory mentions out —
 * those are prose about a layout, not a reference to one file.
 */
const PATH_PATTERN = /`((?:src|tests|scripts|db|api|shared|docs)\/[\w./-]+\.[a-z]+)`/g;

/**
 * A line may opt out with `<!-- doc-paths:ignore -->`, and exactly one thing earns it: prose that
 * names a path deliberately because it no longer exists — a "was here, is now there" table, or a
 * paragraph explaining what an arrangement replaced. Those references are correct BECAUSE the file
 * is missing, so a checker that resolved them would be asking the docs to lie.
 *
 * It is not an escape hatch for a path that merely fails. A reference that should resolve and does
 * not is the bug this exists to find, and silencing it here hides exactly that.
 */
const IGNORE_MARKER = '<!-- doc-paths:ignore -->';

/**
 * Paths carrying a glob or a `<placeholder>` name a SHAPE rather than a file — `tests/**` or
 * `src/modules/<name>/analytics.ts`. There is nothing to resolve, and resolving the literal text
 * would report every one of them.
 */
const isTemplate = (candidate: string) => /[*<>[\]]/.test(candidate);

const frontendRoot = resolveFrontendPath();
const hasFrontend = existsSync(frontendRoot);

if (!hasFrontend) {
    const message =
        `\n[check-document-paths] No frontend checkout at ${frontendRoot}.\n` +
        `  Clone it beside this repo as ${DEFAULT_FRONTEND_PATH}, or set FRONTEND_PATH in .env.\n`;
    if (process.env.CI) {
        console.error(
            `${message}  CI is set, so this is a misconfigured workflow rather than a\n` +
                `  developer with half the pair on disk.\n`
        );
        process.exit(2);
    }
    console.warn(`${message}  Cross-repo paths will be reported as broken — skipping them.\n`);
}

/*
 * The root `.md` files are in scope as well as `docs/`. They are where the cross-cutting notes
 * live, they cite more paths per line than anything under `docs/`, and being outside the docs site
 * is exactly why they get missed.
 */
const files = [...globSync('docs/**/*.md'), ...globSync('*.md')].toSorted();
const broken: { file: string; line: number; target: string }[] = [];
let checked = 0;
/** Paths absent here that no sibling was on disk to vouch for — counted, never reported. */
let unverifiable = 0;

for (const file of files)
    for (const [index, text] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (text.includes(IGNORE_MARKER)) continue;
        for (const [, target] of text.matchAll(PATH_PATTERN)) {
            if (isTemplate(target)) continue;
            checked++;
            if (existsSync(target)) continue;
            // With no sibling on disk a cross-repo reference and a genuinely dead path are
            // indistinguishable, so report NEITHER. Claiming a path is broken because half the
            // pair is missing is the false alarm that gets a gate switched off.
            if (!hasFrontend) {
                unverifiable++;
                continue;
            }
            if (existsSync(path.join(frontendRoot, target))) continue;
            broken.push({ file, line: index + 1, target });
        }
    }

if (broken.length === 0) {
    console.log(
        `[check-document-paths] ${checked} path(s) across ${files.length} file(s) all resolve` +
            (hasFrontend
                ? ' here or in the frontend.'
                : ` in this repo; ${unverifiable} needed the frontend and were not checked.`)
    );
    process.exit(0);
}

console.error(
    `\n[check-document-paths] ${broken.length} of ${checked} documented path(s) do not exist:\n\n` +
        broken.map(({ file, line, target }) => `  ${file}:${line}\n    ${target}`).join('\n') +
        `\n\n  Either the file moved and the doc did not follow, or the path names a shape rather\n` +
        `  than a file — in which case write it with a \`<placeholder>\` or a glob so it reads as\n` +
        `  one, and this check will leave it alone. A path that is missing ON PURPOSE —\n` +
        `  prose about what something used to be — takes ${IGNORE_MARKER} on its line.\n`
);
process.exit(1);
