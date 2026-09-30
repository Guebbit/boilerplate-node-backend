import { execFileSync } from 'node:child_process';
import { gitEnvironment } from '../git-base';

/**
 * Whether a checkout is a linked `git worktree`, rather than its repository's main working tree.
 *
 * A linked worktree keeps its own git dir under the main one's `.git/worktrees/`, so the two
 * paths git reports differ; in the main working tree they are the same directory.
 *
 * @param directory - any directory inside the checkout
 * @returns `true` for a linked worktree, `false` for a main working tree, `undefined` when the
 *   directory is not inside a git checkout at all (a plain copy, a tarball)
 */
export const isLinkedWorktree = (directory: string): boolean | undefined => {
    let output: string;
    try {
        /*
         * git rev-parse: `--git-dir` is this checkout's own git dir, `--git-common-dir` the one
         * shared by every worktree. `--path-format=absolute` makes the two comparable as strings.
         * Stderr is dropped: outside a repository, "not a git repository" is the expected answer.
         * `env: gitEnvironment()` matters when the caller itself runs inside a git hook: git
         * exports `GIT_DIR`/`GIT_WORK_TREE` into the hook's process, and those override `-C`,
         * pointing this call at the HOOK's checkout instead of `directory`.
         * https://git-scm.com/docs/git-rev-parse
         */
        output = execFileSync(
            'git',
            [
                '-C',
                directory,
                'rev-parse',
                '--path-format=absolute',
                '--git-dir',
                '--git-common-dir'
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnvironment() }
        );
    } catch {
        return undefined;
    }
    const [gitDirectory, commonDirectory] = output.trim().split('\n', 2);
    return gitDirectory !== commonDirectory;
};

/**
 * Whether a write from `source` into `target` goes from a linked worktree into a main checkout.
 *
 * `sync:frontend` refuses exactly that: frontend main takes a contract only from backend main.
 * A side that is not a git checkout at all answers false — there is no main checkout to protect.
 *
 * @param source - the checkout the write comes from
 * @param target - the checkout it lands in
 * @returns true only for linked worktree → main checkout
 */
export const writesIntoMainFromWorktree = (source: string, target: string): boolean =>
    isLinkedWorktree(source) === true && isLinkedWorktree(target) === false;
