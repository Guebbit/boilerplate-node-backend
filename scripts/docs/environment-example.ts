/**
 * @module
 * The pure half of `check-environment-example.ts`: what `.env-example` names, compared with what the
 * config slices declare. No filesystem, no git — the CLI feeds it text and sets of names.
 *
 * Only names are compared, never values. The file's values are on purpose invented or
 * development-flavoured, and its prose is richer than a field's one-line `describe`.
 * Where the file is hand-written and why it is not generated: docs/tools/configuration.md
 */

/** One variable the file shows, active (`NAME=`) or commented out (`#NAME=`, optional). */
export interface EnvironmentExampleEntry {
    /** The variable name. */
    name: string;
    /** 1-based line of its first appearance. */
    line: number;
}

/** What a field must say about itself for the comparison. */
export interface DeclaredVariable {
    /** The variable name. */
    name: string;
    /** Who sets it when it is not the operator; such a variable has no line in the file. */
    setBy?: string | undefined;
}

/** A `NAME=` at the start of a line, optionally behind a single `#` (no space: prose is not one). */
const VARIABLE_LINE = /^#?([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Every variable a dotenv file names, first appearance only.
 *
 * @param text - the file's content
 */
export const parseEnvironmentExample = (text: string): EnvironmentExampleEntry[] => {
    const seen = new Set<string>();
    const entries: EnvironmentExampleEntry[] = [];
    for (const [index, line] of text.split('\n').entries()) {
        const name = VARIABLE_LINE.exec(line)?.[1];
        if (name === undefined || seen.has(name)) continue;
        seen.add(name);
        entries.push({ name, line: index + 1 });
    }
    return entries;
};

/**
 * Declared variables the file never mentions: an operator cannot discover them. A variable
 * something else sets (`setBy`) is not the operator's to write, so it is not owed a line.
 *
 * @param entries - what the file names
 * @param declared - what the slices declare
 */
export const missingFromExample = (
    entries: readonly EnvironmentExampleEntry[],
    declared: readonly DeclaredVariable[]
): string[] => {
    const named = new Set(entries.map(({ name }) => name));
    return declared
        .filter(({ name, setBy }) => setBy === undefined && !named.has(name))
        .map(({ name }) => name);
};

/**
 * Variables the file names that nothing reads: no slice declares them and no file outside the
 * docs mentions them. Docker-compose, the npm scripts and third-party libraries read some
 * variables the slices never see, so "read elsewhere" counts as read.
 *
 * @param entries - what the file names
 * @param declared - what the slices declare
 * @param readElsewhere - names found in a non-doc file of the repo
 */
export const lingeringInExample = (
    entries: readonly EnvironmentExampleEntry[],
    declared: readonly DeclaredVariable[],
    readElsewhere: ReadonlySet<string>
): EnvironmentExampleEntry[] => {
    const known = new Set(declared.map(({ name }) => name));
    return entries.filter(({ name }) => !known.has(name) && !readElsewhere.has(name));
};
