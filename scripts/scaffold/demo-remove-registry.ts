/**
 * @module
 * The "central lists" half of the strip: every place a `group: shop` module's NAME is written
 * down outside its own folder, edited generically off that name rather than by a second hand-kept
 * list — `demo-remove.ts`'s registry-editing steps.
 *
 * `src/modules.ts` is the one central file that names a module (an import line per module, then one
 * entry per module in a literal); everything else — the contract's path index, the test suite's
 * router map, the docs — reads what is on disk or in the registry. A
 * `scripts/ops/*.ts` file's own "Removal: owned by `<module>`" comment is what tells this
 * script which reap/sweep scripts, npm-script lines and `docker/crontab` entries belong to a
 * module being removed — nothing here hand-lists them either.
 */

import { readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
 * Drop every line in `content` that is either an import of `./modules/<name>/module` for one of
 * `names`, or a bare-identifier entry naming one of `names` inside a literal (an `enabledModules`
 * array element or a `ModuleName` union member) — every shop
 * module name is a single word, so its array/union/map spelling is always the bare name itself,
 * never a camelCase alias.
 * @param content - the file's current text
 * @param names - module names to strip
 * @param importPattern - how this file spells the module's own import specifier, `name` filled in
 */
const stripModuleLines = (
    content: string,
    names: readonly string[],
    importPattern: (name: string) => RegExp
): string => {
    // A union member (`    | 'cart';`), an array element (`    cart,`) and a map entry
    // (`    cart: cartRouter,`) all reduce to the same shape once the optional `| ` and quotes are
    // peeled off: the bare name, then either end of line or a `:`/`;`/`,` and whatever follows.
    const entryPattern = new RegExp(
        String.raw`^\s*\|?\s*'?(?:${names.join('|')})'?\s*(?:[:;,].*)?$`
    );
    return content
        .split('\n')
        .filter((line) => names.every((name) => !importPattern(name).test(line)))
        .filter((line) => !entryPattern.test(line))
        .join('\n');
};

/**
 * Edit `src/modules.ts`: remove each shop module's import, its `enabledModules` array entry and
 * its `ModuleName` union member.
 */
export const stripModuleRegistry = (repoRoot: string, names: readonly string[]): RemovalNote => {
    const file = path.join(repoRoot, 'src', 'modules.ts');
    const before = readFileSync(file, 'utf8');
    const after = stripModuleLines(
        before,
        names,
        (name) => new RegExp(`from './modules/${name}/module'`)
    );
    writeFileSync(file, after);
    return { file: 'src/modules.ts', detail: `removed ${names.join(', ')}` };
};

/** One `scripts/ops/*.ts` file this script found, and the module its own doc comment says owns it. */
interface OwnedOpsFile {
    absolutePath: string;
    basename: string;
    owner: string;
}

/**
 * Every `scripts/ops/*.ts` file that declares its own owner via a `Removal: owned by \`<module>\``
 * doc comment — the reap/sweep scripts a module takes with it when it goes, read off the
 * files themselves rather than a second list of which script belongs to which module.
 */
const readOwnedOpsFiles = (repoRoot: string): OwnedOpsFile[] => {
    const opsDirectory = path.join(repoRoot, 'scripts', 'ops');
    const ownerPattern = /Removal:\s*owned by (?:the )?`?([a-z][a-z-]*)`?/;

    return readdirSync(opsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .flatMap((entry) => {
            const absolutePath = path.join(opsDirectory, entry.name);
            const match = ownerPattern.exec(readFileSync(absolutePath, 'utf8'));
            return match
                ? [{ absolutePath, basename: entry.name.replace(/\.ts$/, ''), owner: match[1] }]
                : [];
        });
};

/**
 * Delete every reap/sweep script a shop module owns, then the `package.json` line that runs it,
 * then the `docker/crontab` entry that schedules it — in that order, since the crontab step needs
 * to know exactly which npm script names step 2 removed.
 */
export const removeShopOwnedOpsScripts = (
    repoRoot: string,
    shopNames: readonly string[]
): RemovalNote[] => {
    const owned = readOwnedOpsFiles(repoRoot).filter((file) => shopNames.includes(file.owner));
    for (const file of owned) unlinkSync(file.absolutePath);

    const removedScriptNames = removePackageJsonScripts(
        repoRoot,
        owned.map((file) => file.basename)
    );
    removeCrontabEntries(repoRoot, removedScriptNames);

    return [
        ...owned.map((file) => ({
            file: `scripts/ops/${file.basename}.ts`,
            detail: `deleted — owned by ${file.owner}`
        })),
        ...removedScriptNames.map((name) => ({
            file: 'package.json',
            detail: `removed the "${name}" script`
        }))
    ];
};

/**
 * Remove every `package.json` script line whose command runs one of `opsBasenames` — a
 * `"<name>": "tsx scripts/ops/<basename>.ts"` line, verbatim.
 * @returns every npm script NAME removed, for {@link removeCrontabEntries} to find in `crontab`
 */
const removePackageJsonScripts = (repoRoot: string, opsBasenames: readonly string[]): string[] => {
    if (opsBasenames.length === 0) return [];

    const file = path.join(repoRoot, 'package.json');
    const before = readFileSync(file, 'utf8');
    const removed: string[] = [];

    const after = before.replaceAll(
        new RegExp(
            String.raw`^\s*"([a-zA-Z0-9:_-]+)":\s*"tsx scripts/ops/(?:${opsBasenames.join('|')})\.ts",?\n`,
            'gm'
        ),
        (line, scriptName: string) => {
            removed.push(scriptName);
            return '';
        }
    );

    writeFileSync(file, after);
    return removed;
};

/**
 * Remove each `scriptNames` entry's `docker/crontab` line, along with the contiguous run of `#`
 * comment lines directly above it — every cron entry's own explanation (including its
 * `WARNING: owned by` line, when it has one) sits immediately above the line it describes and
 * nowhere else, so consuming that run backwards from the entry is exactly its comment block, no
 * more.
 */
const removeCrontabEntries = (repoRoot: string, scriptNames: readonly string[]): void => {
    if (scriptNames.length === 0) return;

    const file = path.join(repoRoot, 'docker', 'crontab');
    const before = readFileSync(file, 'utf8');

    const escaped = scriptNames.map((name) =>
        name.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
    );
    const after = before.replaceAll(
        new RegExp(String.raw`(?:^#[^\n]*\n)*^\S.*npm run (?:${escaped.join('|')})\n`, 'gm'),
        ''
    );

    writeFileSync(file, after);
};
