/**
 * @module
 * The facts a docs page states about `package.json`, as pure checks over text.
 * `check-references.ts` supplies the pages and the script names and reports what fails here.
 */

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
