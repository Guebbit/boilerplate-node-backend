/**
 * @module
 * The "central lists" half of the strip: every place a `group: shop` module's NAME is written
 * down outside its own folder, edited generically off that name rather than by a second hand-kept
 * list — `demo-remove.ts`'s registry-editing steps.
 *
 * `src/modules.ts` is the one central file that names a module (an import line per module, then one
 * entry per module in a literal); everything else — the contract's path index, the test suite's
 * router map, the docs — reads what is on disk or in the registry. A
 * A module's scheduled jobs are declared on its own manifest, so they leave with its folder and
 * `npm run regenerate` rewrites the crontab.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { entryKey, importKey, memberKey } from './registry';

/** A line this script deleted, and why — printed in `demo-remove.ts`'s final report. */
export interface RemovalNote {
    file: string;
    detail: string;
}

/** Delete every shop module's own folder under `src/modules/`. */
export const removeModuleFolders = (repoRoot: string, names: readonly string[]): RemovalNote[] =>
    names.map((name) => {
        rmSync(path.join(repoRoot, 'src', 'modules', name), { recursive: true, force: true });
        return { file: `src/modules/${name}/`, detail: 'deleted' };
    });

/**
 * Drop every line of `src/modules.ts` that registers one of `names`: its import, its array entry
 * and its `ModuleName` union member. The line matchers are the scaffolder's own
 * (`./registry`), so the file's shape is described once, by the tool that writes it.
 * @param content - the file's current text
 * @param names - module names to strip
 */
const stripModuleLines = (content: string, names: readonly string[]): string =>
    content
        .split('\n')
        .filter(
            (line) =>
                !names.includes(importKey(line)) &&
                !names.includes(entryKey(line)) &&
                // A union member leads with `|`; a quoted word elsewhere is not one.
                !(line.trimStart().startsWith('|') && names.includes(memberKey(line)))
        )
        .join('\n');

/**
 * Edit `src/modules.ts`: remove each shop module's import, its `enabledModules` array entry and
 * its `ModuleName` union member.
 */
export const stripModuleRegistry = (repoRoot: string, names: readonly string[]): RemovalNote => {
    const file = path.join(repoRoot, 'src', 'modules.ts');
    const before = readFileSync(file, 'utf8');
    const after = stripModuleLines(before, names);
    writeFileSync(file, after);
    return { file: 'src/modules.ts', detail: `removed ${names.join(', ')}` };
};
