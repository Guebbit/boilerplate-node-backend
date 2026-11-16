/**
 * @module
 * The facts a docs page states about `package.json`, as pure checks over text.
 * `check-references.ts` supplies the pages and the script names and reports what fails here.
 *
 * Checks:  every `npm run <x>` a page names exists; every page opens with a `type` and an
 *          `audience` in its front-matter.
 * @see docs/build/documentation-style.md#what-check-docs-references-sweeps
 */

import { parse } from 'yaml';

/**
 * A page's text and where it lives, the unit the check reports against.
 */
export interface DocumentPage {
    /** Repo-relative path, for the report. */
    path: string;
    /** The page's markdown. */
    text: string;
}

/**
 * One claim that does not hold, with the page that makes it.
 */
export interface FactFinding {
    /** Page the claim is on. */
    page: string;
    /** What is wrong, in one line. */
    problem: string;
}

/**
 * Every `npm run <script>` a page names, inline or in a fence.
 * A trailing `:` is prose punctuation (`npm run test:*`), not part of the name.
 *
 * @param text - A page's markdown.
 * @returns The distinct script names cited.
 */
export const npmScriptsCited = (text: string): string[] => [
    ...new Set(
        [...text.matchAll(/\bnpm run ([\w.:-]+)/g)]
            .map(([, name]) => name.replace(/:+$/, ''))
            .filter(Boolean)
    )
];

/**
 * Scripts a page tells a reader to run that exist in neither repo.
 *
 * @param pages - The pages to sweep.
 * @param known - Script names defined here or in the paired frontend (the docs cite both).
 * @returns One finding per page and missing script.
 */
export const missingScripts = (pages: DocumentPage[], known: ReadonlySet<string>): FactFinding[] =>
    pages.flatMap(({ path, text }) =>
        npmScriptsCited(text)
            .filter((name) => !known.has(name))
            .map((name) => ({ page: path, problem: `\`npm run ${name}\` is not a script` }))
    );

/** The four kinds of page, one template each. */
const PAGE_TYPES: ReadonlySet<string> = new Set([
    'concept',
    'task',
    'reference',
    'troubleshooting'
]);

/** Who a page is for. */
const AUDIENCES: ReadonlySet<string> = new Set([
    'staff',
    'owner',
    'developer',
    'architect',
    'operator',
    'anyone'
]);

/** The one page that is a landing layout, not content. */
const HOME_PAGE = 'docs/index.md';

/**
 * What the leading `---` block of a page says.
 *
 * @param text - A page's markdown.
 * @returns The parsed keys; `{}` when the block is not a mapping; `undefined` when the page has no
 *   front-matter block.
 */
const frontMatterOf = (text: string): Record<string, unknown> | undefined => {
    const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
    if (block === undefined) return undefined;
    // `yaml`'s parse: a mapping for a front-matter block; anything else is treated as empty.
    const parsed: unknown = parse(block);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed))
        : {};
};

/**
 * Pages whose front-matter lacks a valid `type` or `audience`. The home page is exempt.
 *
 * @param pages - The pages to sweep.
 * @returns One finding per page and problem.
 */
export const missingFrontMatter = (pages: DocumentPage[]): FactFinding[] =>
    pages
        .filter(({ path }) => path !== HOME_PAGE)
        .flatMap(({ path, text }) => {
            const meta = frontMatterOf(text);
            if (!meta) return [{ page: path, problem: 'no front-matter block (type, audience)' }];

            const findings: FactFinding[] = [];
            if (typeof meta.type !== 'string' || !PAGE_TYPES.has(meta.type))
                findings.push({
                    page: path,
                    problem: `front-matter \`type\` must be one of ${[...PAGE_TYPES].join(', ')}`
                });

            const audience: unknown = meta.audience;
            const valid =
                Array.isArray(audience) &&
                audience.length > 0 &&
                audience.every((value) => typeof value === 'string' && AUDIENCES.has(value));
            if (!valid)
                findings.push({
                    page: path,
                    problem: `front-matter \`audience\` must be a non-empty list from ${[...AUDIENCES].join(', ')}`
                });
            return findings;
        });
