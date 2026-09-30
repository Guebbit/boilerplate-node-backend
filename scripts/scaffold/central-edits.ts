/**
 * @module
 * The edits a new module still makes OUTSIDE its own folder, as pure text transforms. Today that
 * is four files, and each is here because something reads a hand-kept list:
 *
 * | file                                            | why a module is named there                  |
 * | ----------------------------------------------- | -------------------------------------------- |
 * | `src/modules.ts`                                | the registry: import, array, `ModuleName`    |
 * | `shared/authorization-roles.yaml`               | admin (and so system) lists every key by name |
 * | `shared/authorization-conformance.yaml`         | its fixture copy of the admin list           |
 * | `tests/cross-cutting/replace-patch-parity.test.ts` | the exact set of PUT/PATCH pairs          |
 *
 * Each transform throws when its anchor is gone, so a file that changed shape refuses the
 * scaffold before anything is written instead of being silently skipped.
 */

import { permissionKeys, type ModuleNames } from './names';
import { registerModule } from './registry';

/** One edit to an existing file. */
export interface CentralEdit {
    /** Repo-relative path. */
    path: string;
    /** The file's new text, given its current text. */
    apply: (source: string) => string;
}

/**
 * Append list items to the block that follows an anchor line, ending at the first blank line.
 * @param source - the file text
 * @param anchor - a substring of the line that opens the list
 * @param items - the entries to append, without the dash
 * @returns the edited text
 * @throws {Error} when the anchor is missing
 */
const appendToList = (source: string, anchor: string, items: readonly string[]): string => {
    const lines = source.split('\n');
    const opens = lines.findIndex((line) => line.includes(anchor));
    if (opens === -1) throw new Error(`anchor "${anchor}" not found`);

    const blank = lines.findIndex((line, index) => index > opens && line.trim() === '');
    const end = blank === -1 ? lines.length : blank;
    const last = lines[end - 1];
    const indent = /^\s*/.exec(last)?.[0] ?? '';

    return [
        ...lines.slice(0, end),
        ...items.map((item) => `${indent}- ${item}`),
        ...lines.slice(end)
    ].join('\n');
};

/**
 * The entity a parity-table row names.
 * @param row - a table row, e.g. `Account: 'account'`
 * @returns the key
 */
const entityOf = (row: string): string => row.trim().split(':', 1)[0];

/**
 * Add an entry to the parity test's `known` table, alphabetical by entity.
 * @param source - the test's text
 * @param names - the new module's spellings
 * @returns the edited text
 * @throws {Error} when the table is not found
 */
const addParityEntry = (source: string, names: ModuleNames): string => {
    const lines = source.split('\n');
    const opens = lines.findIndex((line) =>
        line.includes('const known: Record<string, string> = {')
    );
    if (opens === -1) throw new Error('the `known` table not found');

    const closes = lines.findIndex((line, index) => index > opens && line.trim() === '};');
    const rows = lines.slice(opens + 1, closes).map((row) => row.replace(/,$/, ''));
    const row = `            ${names.entity}: '${names.kebab}'`;
    const at = rows.findIndex((existing) => entityOf(existing) > names.entity);
    const sorted = at === -1 ? [...rows, row] : [...rows.slice(0, at), row, ...rows.slice(at)];

    return [
        ...lines.slice(0, opens + 1),
        ...sorted.map((line, index) => (index === sorted.length - 1 ? line : `${line},`)),
        ...lines.slice(closes)
    ].join('\n');
};

/**
 * Every central edit a module needs.
 * @param names - the new module's spellings
 * @returns the edits, in a stable order
 */
export const centralEdits = (names: ModuleNames): CentralEdit[] => [
    { path: 'src/modules.ts', apply: (source) => registerModule(source, names) },
    {
        path: 'shared/authorization-roles.yaml',
        apply: (source) =>
            appendToList(source, 'permissions: &admin_permissions', permissionKeys(names))
    },
    {
        path: 'shared/authorization-conformance.yaml',
        apply: (source) =>
            appendToList(source, 'admin-permissions: &admin_permissions', permissionKeys(names))
    },
    {
        path: 'tests/cross-cutting/replace-patch-parity.test.ts',
        apply: (source) => addParityEntry(source, names)
    }
];
