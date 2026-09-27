import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The repo root — every git call below runs from here, not from the caller's cwd.
 */
export const REPO_ROOT = path.join(__dirname, '..');

/**
 * `process.env`, minus the three vars git exports into every hook it runs
 * (`GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`). A nested `git` call that targets some OTHER
 * checkout by `cwd`/`-C` must use this: those vars, once set, override that targeting and point
 * the nested call at the hook's own repo instead — silently, since the command still exits 0.
 *
 * Pass this as `env` to every `execFileSync('git', …)` whose `cwd` or `-C` argument is not
 * `REPO_ROOT` itself.
 */
export const gitEnvironment = (): NodeJS.ProcessEnv => {
    const environment = { ...process.env };
    delete environment.GIT_DIR;
    delete environment.GIT_WORK_TREE;
    delete environment.GIT_INDEX_FILE;
    return environment;
};

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
