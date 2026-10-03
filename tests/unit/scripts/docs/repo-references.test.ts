/**
 * `scripts/docs/repo-references.ts` — the tracked-file set every reference check resolves against.
 *
 * `gitEnvironment`: a nested `git` call inside the pre-commit hook inherits the hook's
 *                   `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and reads the WRONG repo; this
 *                   strips them before every such call.
 * `trackedTargets`: what a citation may resolve to — and what it may not.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitEnvironment, resolves, trackedTargets } from '../../../../scripts/docs/repo-references';
import { setProcessEnvironment } from '@tests/environment';

/** The three vars git exports into a hook's process — put back after every case by the harness. */
const HOOK_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'] as const;

describe('gitEnvironment', () => {
    it('strips GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE, simulating a hook environment', () => {
        setProcessEnvironment({ GIT_DIR: '/repo/.git' });
        setProcessEnvironment({ GIT_WORK_TREE: '/repo' });
        setProcessEnvironment({ GIT_INDEX_FILE: '/repo/.git/index' });

        const environment = gitEnvironment();

        expect(environment.GIT_DIR).toBeUndefined();
        expect(environment.GIT_WORK_TREE).toBeUndefined();
        expect(environment.GIT_INDEX_FILE).toBeUndefined();
    });

    it('leaves every other variable untouched', () => {
        setProcessEnvironment({ GIT_DIR: '/repo/.git' });

        const environment = gitEnvironment();

        expect(environment.PATH).toBe(process.env.PATH);
    });

    it('is a no-op copy when none of the three are set', () => {
        setProcessEnvironment(Object.fromEntries(HOOK_VARS.map((key) => [key, undefined])));

        expect(gitEnvironment()).toEqual(process.env);
    });
});

describe('trackedTargets', () => {
    /** A scratch repo, so the case controls exactly which files git tracks. */
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(os.tmpdir(), 'repo-references-'));
        // git: an empty repo, then stage files — `ls-files` lists the index, no commit needed.
        execFileSync('git', ['init', '--quiet'], { cwd: root, env: gitEnvironment() });
        for (const file of ['src/kept.ts', '.2brain/llm-wiki/src/gone.ts.md']) {
            mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
            writeFileSync(path.join(root, file), '');
        }
        execFileSync('git', ['add', '.'], { cwd: root, env: gitEnvironment() });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('resolves a tracked source file', () => {
        expect(resolves(trackedTargets(root).targets, 'src/kept.ts')).toBe(true);
    });

    it('does not let a `.2brain` mirror page vouch for a source file that is gone', () => {
        expect(resolves(trackedTargets(root).targets, 'src/gone.ts')).toBe(false);
    });
});
