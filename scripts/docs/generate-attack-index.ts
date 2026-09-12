/**
 * @module
 * Rebuilds the A-Z attack index in `docs/theory/defences/index.md` from the defence pages
 * themselves.
 *
 * Why generated: the index is one row per attack across twenty pages, and a hand-kept copy of
 * three hundred names is a list that silently stops matching the pages it points at. Reading the
 * pages means a renamed heading or a dropped row cannot leave a dead anchor behind.
 *
 * Run by `npm run docs:attacks`, and by `npm run regenerate` alongside the other docs generators.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Prettier's own API, so the written file is already in the shape `prettier:check` demands.
// Without it `regenerate` and the format gate would rewrite each other's table padding forever.
// https://prettier.io/docs/en/api
import { format, resolveConfig } from 'prettier';

/**
 * The defences directory, resolved from this file rather than from the working directory, so the
 * script behaves the same whether npm or a person invoked it.
 */
const DEFENCES_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../docs/theory/defences'
);

/**
 * The index page the generated block is written into.
 */
const INDEX_PATH = path.join(DEFENCES_DIR, 'index.md');

/**
 * The markers the generated block replaces the content between. Matching VitePress's own comment
 * style, so the block is invisible in the rendered page.
 */
const BEGIN = '<!-- BEGIN:attack-index -->';
const END = '<!-- END:attack-index -->';

/**
 * One attack, as harvested from a table row.
 */
interface AttackEntry {
    /** The attack's name, first cell of the row, markdown stripped. */
    name: string;
    /** The defence page's filename, e.g. the injection page. */
    page: string;
    /** The page's `# ` title, for the "Family" column. */
    family: string;
    /** The GitHub/VitePress slug of the nearest heading above the row. */
    anchor: string;
}

/**
 * The heading slug VitePress will actually emit, reproducing `@mdit-vue/shared`'s `slugify`.
 *
 * Transcribed rather than approximated, because the difference is invisible until a link 404s: it
 * REPLACES punctuation with a hyphen rather than dropping it, so `The language's own sharp edges`
 * becomes `the-language-s-own-sharp-edges`. Inline code and emphasis go first — a slug is built
 * from the heading's text, not its markup.
 *
 * https://github.com/mdit-vue/mdit-vue/blob/main/packages/shared/src/slugify.ts
 *
 * @param heading - the heading's text, without its leading hashes
 * @returns the anchor fragment, without a leading `#`
 */
const slugify = (heading: string): string =>
    heading
        .replaceAll(/`([^`]*)`/g, '$1')
        .replaceAll(/[*_]/g, '')
        .normalize('NFKD')
        .replaceAll(/[\u0300-\u036F]/g, '')
        .replaceAll(/[^\w -]/g, '-')
        .trim()
        .replaceAll(/\s+/g, '-')
        .replaceAll(/-{2,}/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .toLowerCase();

/**
 * Strip the markdown a table cell may carry, leaving the plain attack name.
 *
 * Links keep their TEXT and lose their target: a name is what a reader searches for, and the
 * target here is always the page we are already recording.
 *
 * @param cell - the raw first cell of a table row
 * @returns the name as plain text
 */
const plainText = (cell: string): string =>
    cell
        .replaceAll(/\[([^\]]*)]\([^)]*\)/g, '$1')
        .replaceAll('`', '')
        .replaceAll('**', '')
        .trim();

/**
 * Harvest every attack row from one defence page.
 *
 * A row counts when it is inside a table whose first column header is `Attack` or `Name` — that is
 * what separates the attack tables from the several supporting tables (guarantees, rungs, how to
 * read a row) that share the page.
 *
 * @param file - the page's filename within the defences directory
 * @returns every attack found, in document order
 */
const harvestPage = (file: string): AttackEntry[] => {
    const lines = readFileSync(path.join(DEFENCES_DIR, file), 'utf8').split('\n');
    const entries: AttackEntry[] = [];
    let family = file.replace('.md', '');
    let anchor = '';
    let inAttackTable = false;
    let fenced = false;

    for (const line of lines) {
        // Mermaid and code fences contain pipes that would otherwise read as table rows.
        if (line.startsWith('```')) fenced = !fenced;
        if (fenced) continue;

        if (line.startsWith('# ')) family = line.slice(2).trim();

        if (line.startsWith('#')) {
            const heading = /^#{2,4} (.*)$/.exec(line);
            if (heading?.[1]) anchor = slugify(heading[1]);
            inAttackTable = false;
            continue;
        }

        if (!line.startsWith('|')) {
            inAttackTable = false;
            continue;
        }

        const cells = line.split('|').slice(1, -1);
        const first = plainText(cells[0] ?? '');

        // A header row opens the table; everything until a non-table line belongs to it.
        if (first === 'Attack' || first === 'Name') {
            inAttackTable = true;
            continue;
        }
        // The `| --- |` separator under a header.
        if (/^-+$/.test(first.replaceAll(/[\s:]/g, ''))) continue;
        if (!inAttackTable || !first) continue;

        entries.push({ name: first, page: file, family, anchor });
    }

    return entries;
};

/**
 * Fold a name down to what it should sort by: letters and digits only, case-insensitive.
 *
 * So `alg: none` files under A and `3-D Secure bypass` under 3, rather than punctuation deciding
 * the order.
 *
 * @param value - the attack name
 * @returns the comparison key
 */
const sortKey = (value: string): string => value.toLowerCase().replaceAll(/[^\da-z]/g, '');

/**
 * Build the markdown table, sorted by attack name, case- and punctuation-insensitively.
 *
 * A name appearing on two pages keeps both rows: an attack genuinely answered in two places
 * should lead a reader to both, and collapsing them would hide the second.
 *
 * @param entries - every harvested attack
 * @returns the rendered markdown block
 */
const renderTable = (entries: AttackEntry[]): string => {
    const sorted = entries.toSorted((left, right) =>
        sortKey(left.name).localeCompare(sortKey(right.name))
    );

    const rows = sorted.map(
        ({ name, page, family, anchor }) =>
            `| ${name} | [${family}](${page}${anchor ? `#${anchor}` : ''}) |`
    );

    return ['| Attack | Answered in |', '| --- | --- |', ...rows].join('\n');
};

/**
 * Read every defence page, rebuild the block, and write it back between the markers.
 *
 * @returns once the formatted file is on disk
 */
const generate = async (): Promise<void> => {
    const pages = readdirSync(DEFENCES_DIR)
        .filter((file) => file.endsWith('.md') && file !== 'index.md')
        .toSorted();

    const entries = pages.flatMap((file) => harvestPage(file));
    const index = readFileSync(INDEX_PATH, 'utf8');
    const begin = index.indexOf(BEGIN);
    const end = index.indexOf(END);

    if (begin === -1 || end === -1)
        throw new Error(`Missing ${BEGIN} / ${END} markers in ${INDEX_PATH}`);

    const rebuilt =
        index.slice(0, begin + BEGIN.length) + `\n\n${renderTable(entries)}\n\n` + index.slice(end);

    // `filepath` is what tells prettier to parse this as markdown, and it also picks up the repo's
    // own `.prettierrc` through `resolveConfig`.
    const options = await resolveConfig(INDEX_PATH);
    const formatted = await format(rebuilt, { ...options, filepath: INDEX_PATH });

    writeFileSync(INDEX_PATH, formatted);
    console.log(`Attack index: ${entries.length} rows from ${pages.length} pages.`);
};

// Chained rather than top-level `await`: tsx transforms this script to CJS, where top-level await
// is a transform error. A rejection must also set the exit code, or a broken generator would look
// like a clean run to `regenerate`.
generate().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
