/**
 * @module
 * A scratch copy of the checkout that the `measure:*` scripts can wreck: they change something in
 * it (strip the shop, scaffold a module) and run the repo's own checks against what is left.
 *
 * `node_modules` is symlinked rather than copied or reinstalled: the question is what the SOURCE
 * looks like after the change, not whether npm still works.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Top-level entries never copied into the scratch tree: regenerated or symlinked instead. */
const SKIP_ENTRIES = new Set(['node_modules', '.git', '.claude', 'tmp']);

/**
 * Run a command in the scratch tree and report whether it succeeded. Never throws: a failing
 * command is usually the measurement, not the script's own error.
 * @param scratch - the scratch root
 * @param command - the executable
 * @param commandArguments - its arguments
 * @returns true when it exited 0
 */
export const runIn = (
    scratch: string,
    command: string,
    commandArguments: readonly string[]
): boolean => spawnSync(command, commandArguments, { cwd: scratch, stdio: 'inherit' }).status === 0;

/**
 * Copy the checkout into `scratch`, link its dependencies and make it a git repository.
 * @param repoRoot - the checkout to copy
 * @param scratch - where to build the copy; wiped first. Must live OUTSIDE `repoRoot`, since
 *   `fs.cpSync` refuses a destination that is a subdirectory of its own source
 * @throws {Error} when the scratch tree cannot be made a repository
 */
export const assembleScratchCopy = (repoRoot: string, scratch: string): void => {
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });

    cpSync(repoRoot, scratch, {
        recursive: true,
        filter: (source) => !SKIP_ENTRIES.has(path.relative(repoRoot, source).split(path.sep)[0])
    });

    // Node resolves through the symlink exactly as it would a real directory.
    symlinkSync(path.join(repoRoot, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');

    // A symlinked `node_modules` resolves outside the scratch tree, and TypeScript then refuses to
    // name a type reached through it (TS2883): an artifact of the measurement, not of the code.
    // `preserveSymlinks` makes it resolve through the link the way a real install would.
    // https://www.typescriptlang.org/tsconfig/#preserveSymlinks
    const tsconfig = path.join(scratch, 'tsconfig.json');
    writeFileSync(
        tsconfig,
        readFileSync(tsconfig, 'utf8').replace(
            '"strict": true,',
            '"strict": true,\n"preserveSymlinks": true,'
        )
    );

    // `regenerate`'s `docs:graph` asks `git ls-files` which files each module owns.
    if (!runIn(scratch, 'git', ['init', '--quiet']) || !runIn(scratch, 'git', ['add', '--all']))
        throw new Error('[scratch] could not make the scratch copy a git repository.');
};
