/**
 * `scripts/docs/repo-references.ts`'s `gitEnvironment` — the fix for a nested `git` call reading
 * the WRONG repo when this check runs from inside the pre-commit hook. Git exports
 * `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` into the hook's own process; a plain
 * `execFileSync('git', …)` inherits them and resolves against the hook's repo/tree instead of its
 * own `cwd`. `gitEnvironment()` is what strips them before every such call.
 */
import { gitEnvironment } from '../../../../scripts/docs/repo-references';

/** The three vars git exports into a hook's process — restored after every case. */
const HOOK_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'] as const;
const previous: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const key of HOOK_VARS) previous[key] = process.env[key];
});

afterEach(() => {
    for (const key of HOOK_VARS) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
});

describe('gitEnvironment', () => {
    it('strips GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE, simulating a hook environment', () => {
        process.env.GIT_DIR = '/repo/.git';
        process.env.GIT_WORK_TREE = '/repo';
        process.env.GIT_INDEX_FILE = '/repo/.git/index';

        const environment = gitEnvironment();

        expect(environment.GIT_DIR).toBeUndefined();
        expect(environment.GIT_WORK_TREE).toBeUndefined();
        expect(environment.GIT_INDEX_FILE).toBeUndefined();
    });

    it('leaves every other variable untouched', () => {
        process.env.GIT_DIR = '/repo/.git';

        const environment = gitEnvironment();

        expect(environment.PATH).toBe(process.env.PATH);
    });

    it('is a no-op copy when none of the three are set', () => {
        for (const key of HOOK_VARS) delete process.env[key];

        expect(gitEnvironment()).toEqual(process.env);
    });
});
