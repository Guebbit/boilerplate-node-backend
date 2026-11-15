/**
 * @module
 * Which committed files a regeneration would change — the core of the pre-commit hook's
 * "refuse a stale generated file" check (`check-generated-fresh.ts`).
 *
 * Builds from what is being COMMITTED, not from the working tree: the index is exported to a
 * scratch folder, regenerated there, and compared with itself. A peer's unsaved edit, or a file
 * regenerated on disk but never staged, therefore cannot make a stale commit look fresh.
 * The same shape as Kubernetes' `verify-generated.sh`.
 *
 * See: docs/build/regenerating.md#the-pre-commit-hook
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitEnvironment } from '../git-base';

/**
 * What the check needs to know about the repository it inspects.
 */
export interface StaleGeneratedOptions {
    /** The checkout whose index is being committed. */
    repo: string;
    /**
     * Regenerates every artifact inside `tree`, a scratch copy of the index. It owns the
     * environment of that copy (linked `node_modules`, the command to run) and throws on failure.
     */
    regenerate: (tree: string) => void;
    /**
     * The environment the index export runs under. The hook leaves git's own `GIT_INDEX_FILE` in
     * place so a partial `git commit -- <paths>` exports its temporary index; a test passes a
     * clean one.
     */
    indexEnvironment?: NodeJS.ProcessEnv;
}

/**
 * Run one git command in `directory`, resolving its stdout.
 *
 * @param directory - the working directory
 * @param arguments_ - git's arguments
 * @param environment - the environment to run under
 */
const git = (
    directory: string,
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv
): string =>
    execFileSync('git', [...arguments_], { cwd: directory, env: environment, encoding: 'utf8' });

/**
 * Split a NUL-terminated git listing into paths.
 *
 * @param output - the raw `-z` output
 */
const paths = (output: string): string[] => output.split('\0').filter((entry) => entry !== '');

/**
 * Export the index, regenerate inside the export, and name what moved.
 *
 * @param options - the checkout and how to regenerate in a copy of it
 * @returns repo-relative paths a regeneration rewrote, or added without them being tracked; empty
 *   when every generated file in the commit is current
 * @throws when `regenerate` fails, or a git command does
 */
export const staleGeneratedFiles = (options: StaleGeneratedOptions): string[] => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'verify-generated-'));
    const clean = gitEnvironment();
    try {
        // `checkout-index -a --prefix=<dir>/`: writes every file of the index under `<dir>/`
        // (the trailing slash is required). https://git-scm.com/docs/git-checkout-index
        git(
            options.repo,
            ['checkout-index', '--all', `--prefix=${scratch}/`],
            options.indexEnvironment ?? process.env
        );
        // A repository of its own, so the export has an index to compare against and the steps
        // that ask `git ls-files` (the module graph) work there.
        git(scratch, ['init', '--quiet'], clean);
        git(scratch, ['add', '--all'], clean);

        options.regenerate(scratch);

        // `diff --name-only`: files the regeneration rewrote. `ls-files --others`: files it added
        // that no .gitignore covers, so they should have been committed.
        return [
            ...paths(git(scratch, ['diff', '--name-only', '-z'], clean)),
            ...paths(git(scratch, ['ls-files', '--others', '--exclude-standard', '-z'], clean))
        ];
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
};
