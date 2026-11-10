import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './modules-on-disk';

/**
 * `process.env`, minus every `GIT_*` variable. A sandboxed nested `git` needs none of the outer
 * ones. The ones that matter, which the unit test names as the documented minimum:
 *
 * - git's own `--local-env-vars` list (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, …): a hook
 *   exports them, and they override the `cwd`/`-C` a nested call was aimed with, so it silently
 *   reads the hook's own repo while still exiting 0;
 * - `GIT_AUTHOR_*` and `GIT_COMMITTER_*`: they change the identity of whatever it writes;
 * - `GIT_CONFIG_PARAMETERS`/`COUNT`/`KEY_<n>`/`VALUE_<n>`: they inject settings.
 *
 * https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---local-env-vars
 *
 * Pass this as `env` to every `execFileSync('git', …)` whose `cwd` or `-C` argument is not
 * `REPO_ROOT` itself. The FE's `scripts/audit/check-clean.ts` carries an identical copy.
 */
export const gitEnvironment = (): NodeJS.ProcessEnv =>
    Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

/** `git merge-base HEAD <ref>`, or `undefined` when git refuses to resolve `ref`. */
const resolveRef = (ref: string): string | undefined => {
    try {
        // Finds the common ancestor of HEAD and the target ref, so diffs compare what would actually ship.
        return execFileSync('git', ['merge-base', 'HEAD', ref], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        }).trim();
    } catch {
        return undefined;
    }
};

/**
 * Resolves the merge-base between HEAD and `base`, ensuring a stale local branch does not widen
 * the comparison to commits never shipped.
 *
 * An unresolvable DEFAULT `origin/main` (a fresh clone whose remote tracks a different default
 * branch name, or one that has not fetched it yet) falls back to `origin/HEAD` — the symbolic ref
 * that follows whatever the remote's actual default branch is — before giving up. An explicit
 * `--base=<ref>` a caller passed is never silently swapped for something else: it still fails hard,
 * since the caller asked for something specific.
 *
 * @param base - the ref to compare against (e.g. 'origin/main', 'HEAD~3')
 * @param scriptName - the calling script's name, for messages
 * @param resolve - the ref resolver; overridden in tests, `resolveRef` (real git) otherwise
 * @returns the merge-base SHA, or `undefined` when nothing origin-shaped resolves at all — the
 *   caller's cue to skip the check rather than fail a clone with no usable `origin` remote
 * @throws process.exit(2) when an explicitly requested `base` cannot be resolved
 */
export const mergeBase = (
    base: string,
    scriptName: string,
    resolve: (ref: string) => string | undefined = resolveRef
): string | undefined => {
    const direct = resolve(base);
    if (direct !== undefined) return direct;

    if (base !== 'origin/main') {
        console.error(
            `[${scriptName}] cannot resolve '${base}'. In CI, fetch it first ` +
                `(actions/checkout with fetch-depth: 0), or pass --base=<ref>.`
        );
        process.exit(2);
    }

    const viaOriginHead = resolve('origin/HEAD');
    if (viaOriginHead !== undefined) return viaOriginHead;

    console.log(
        `[${scriptName}] neither 'origin/main' nor 'origin/HEAD' resolve — skipping. Fetch the ` +
            'remote, or pass --base=<ref>, to run this check for real.'
    );
    return undefined;
};
