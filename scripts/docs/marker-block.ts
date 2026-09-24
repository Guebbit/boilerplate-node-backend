/**
 * Shared write-or-report logic for every doc generator that keeps a generated block between
 * `<!-- name:start -->` / `<!-- name:end -->` markers inside an otherwise hand-written page:
 * `docs:graph`, `docs:roles`, `docs:dependencies` and `docs:rate-limits`.
 *
 * Each block is replaced independently by its own marker pair — everything outside every pair,
 * and any hand-written text between two blocks in the same page, is left untouched. The result is
 * formatted with the page's own prettier config before it is compared or written, because
 * `complete` also runs `prettier --check` over `docs/`, and an unformatted block would leave the
 * two checks demanding different bytes from the same file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';

/** One generated block: the markers bounding it, and the content to put between them. */
export interface MarkerBlock {
    start: string;
    end: string;
    body: string;
}

/** Everything one generator needs to write or check its blocks in a single page. */
export interface MarkerPageOptions {
    /** Absolute path to the page carrying the blocks. */
    file: string;
    /** Repo root, for the relative path used in log lines. */
    root: string;
    /** The marker pairs to replace, applied in order. */
    blocks: MarkerBlock[];
    /** The generator's log prefix, e.g. `rate-limit-budgets`. */
    label: string;
    /** Report drift instead of rewriting the page — what `complete` runs. */
    checkOnly: boolean;
    /** What the page has drifted from, for the `--check` failure message, e.g. `the module graph`. */
    driftSubject: string;
    /** The npm script a drifted `--check` run should point at, e.g. `docs:rate-limits`. */
    rerunScript: string;
}

/**
 * Writes every block into `file`, or reports that it has drifted.
 *
 * @returns the process exit code: 0 when clean or updated, 1 when a marker pair is missing or
 *   (under `checkOnly`) the page has drifted from its source
 */
export const applyMarkerBlocks = async ({
    file,
    root,
    blocks,
    label,
    checkOnly,
    driftSubject,
    rerunScript
}: MarkerPageOptions): Promise<number> => {
    const relativeLabel = path.relative(root, file);
    const original = readFileSync(file, 'utf8');

    let page = original;
    for (const { start, end, body } of blocks) {
        const from = page.indexOf(start);
        const to = page.indexOf(end);
        if (from === -1 || to === -1) {
            console.error(`[${label}] markers ${start} / ${end} not found in ${relativeLabel}`);
            return 1;
        }
        page = `${page.slice(0, from + start.length)}\n\n${body}\n\n${page.slice(to)}`;
    }

    const next = await format(page, { ...(await resolveConfig(file)), filepath: file });

    if (next === original) return 0;

    if (checkOnly) {
        const prefix = `[${label}] `;
        console.error(
            `${prefix}${relativeLabel} is out of date with ${driftSubject}.\n` +
                `${' '.repeat(prefix.length)}Run \`npm run ${rerunScript}\` and commit the result.`
        );
        return 1;
    }

    writeFileSync(file, next);
    console.log(`[${label}] ${relativeLabel} updated.`);
    return 0;
};
