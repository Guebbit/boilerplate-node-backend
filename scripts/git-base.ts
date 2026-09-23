import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The repo root — every git call below runs from here, not from the caller's cwd.
 */
export const REPO_ROOT = path.join(__dirname, '..');

/**
 * Resolves the merge-base between HEAD and a given ref, ensuring a stale local branch
 * does not widen the comparison to commits never shipped.
 *
 * @param base — the ref to compare against (e.g. 'origin/main', 'HEAD~3')
 * @param scriptName — the calling script's name, for error messages
 * @returns the SHA of the merge-base
 * @throws process.exit(2) when the ref cannot be resolved
 */
export const mergeBase = (base: string, scriptName: string): string => {
    try {
        // Finds the common ancestor of HEAD and the target ref, so diffs compare what would actually ship.
        // HEAD is the current branch, base is the ref to compare against (e.g. 'origin/main').
        return execFileSync('git', ['merge-base', 'HEAD', base], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        }).trim();
    } catch {
        console.error(
            `[${scriptName}] cannot resolve '${base}'. In CI, fetch it first ` +
                `(actions/checkout with fetch-depth: 0), or pass --base=<ref>.`
        );
        process.exit(2);
    }
};
