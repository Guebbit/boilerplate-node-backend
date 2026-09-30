/**
 * @module
 * The one central edit a new module needs: its lines in `src/modules.ts` (the import, the array
 * entry and the `ModuleName` member). Pure text in, text out, so it is testable without a checkout.
 */

import type { ModuleNames } from './names';

/**
 * Insert `line` into the run of consecutive lines matching `belongs`, keeping that run ordered by
 * `keyOf`.
 * @param lines - the file, split on newlines
 * @param belongs - whether a line is part of the run
 * @param keyOf - the sort key of a run line
 * @param line - the line to add
 * @param key - the new line's sort key
 * @returns the lines with `line` added
 * @throws {Error} when the run is not found
 */
const insertInRun = (
    lines: readonly string[],
    belongs: (line: string) => boolean,
    keyOf: (line: string) => string,
    line: string,
    key: string
): string[] => {
    const first = lines.findIndex((candidate) => belongs(candidate));
    if (first === -1) throw new Error(`src/modules.ts: no line matched for "${line.trim()}"`);

    let end = first;
    while (end < lines.length && belongs(lines[end])) end += 1;

    const offset = lines.slice(first, end).findIndex((candidate) => keyOf(candidate) > key);
    const at = offset === -1 ? end : first + offset;
    return [...lines.slice(0, at), line, ...lines.slice(at)];
};

/** The trailing name of an `import x from './modules/<name>/module';` line. */
const importKey = (line: string): string => /\.\/modules\/([^/]+)\/module/.exec(line)?.[1] ?? '';

/** The name inside a `| 'name'` (or `type ModuleName =\n | 'name'`) member line. */
const memberKey = (line: string): string => /'([^']+)'/.exec(line)?.[1] ?? '';

/** The identifier on an array-entry line such as `    fieldNotes,`. */
const entryKey = (line: string): string => line.replaceAll(/[\s,]/g, '');

/**
 * Whether `source` already registers `kebab`.
 * @param source - the text of `src/modules.ts`
 * @param kebab - the module folder name
 * @returns true when the import line is present
 */
export const isRegistered = (source: string, kebab: string): boolean =>
    source.split('\n').some((line) => importKey(line) === kebab);

/**
 * Give every line in the FIRST run `ending` except the last, which gets `last`. Insertion can move
 * the last line, so the terminators are rewritten after it rather than tracked during it.
 * @param lines - the file, split on newlines
 * @param belongs - whether a line is part of the run
 * @param ending - the terminator of a non-final run line
 * @param last - the terminator of the final run line
 * @returns the lines with corrected terminators
 */
const retermRun = (
    lines: readonly string[],
    belongs: (line: string) => boolean,
    ending: string,
    last: string
): string[] => {
    const first = lines.findIndex((line) => belongs(line));
    let end = first;
    while (end < lines.length && belongs(lines[end])) end += 1;

    return lines.map((line, index) =>
        index >= first && index < end
            ? line.replace(/[,;]$/, '') + (index === end - 1 ? last : ending)
            : line
    );
};

/** An array-entry line of `enabledModules`. */
const isEntry = (line: string): boolean => /^ {4}[a-zA-Z]+[,;]?$/.test(line);

/** A member line of the `ModuleName` union. */
const isMember = (line: string): boolean => /^ {4}\| '/.test(line);

/**
 * Split `lines` after the first one starting with `marker`.
 * @param lines - the file, split on newlines
 * @param marker - the prefix that opens the region
 * @returns the head up to and including the marker line, and the rest
 * @throws {Error} when no line starts with the marker
 */
const splitAfter = (
    lines: readonly string[],
    marker: string
): { head: string[]; rest: string[] } => {
    const at = lines.findIndex((line) => line.startsWith(marker));
    if (at === -1) throw new Error(`src/modules.ts: "${marker}" not found`);
    return { head: lines.slice(0, at + 1), rest: lines.slice(at + 1) };
};

/**
 * Register a module in `src/modules.ts`, keeping every list in its alphabetical order.
 * @param source - the text of `src/modules.ts`
 * @param names - the new module's spellings
 * @returns the edited text
 * @throws {Error} when the file's shape is not the one this edit understands
 */
export const registerModule = (source: string, names: ModuleNames): string => {
    const importLine = `import ${names.identifier} from './modules/${names.kebab}/module';`;
    const withImport = insertInRun(
        source.split('\n'),
        (line) => line.startsWith('import ') && importKey(line) !== '',
        importKey,
        importLine,
        names.kebab
    );

    // Array entries are ordered by identifier, the import lines by folder name: for a name like
    // `api-keys` those differ, and each list stays sorted by what it prints.
    const array = splitAfter(withImport, 'export const enabledModules');
    const withEntry = [
        ...array.head,
        ...retermRun(
            insertInRun(
                array.rest,
                isEntry,
                entryKey,
                `    ${names.identifier},`,
                names.identifier
            ),
            isEntry,
            ',',
            ''
        )
    ];

    const union = splitAfter(withEntry, 'export type ModuleName');
    const withMember = retermRun(
        insertInRun(union.rest, isMember, memberKey, `    | '${names.kebab}'`, names.kebab),
        isMember,
        '',
        ';'
    );

    return [...union.head, ...withMember].join('\n');
};
