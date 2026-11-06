/**
 * `scripts/hooks/stale-generated-files.ts` — the pre-commit hook's check that the committed
 * generated files are current.
 *
 * Each case builds a real git repository and a stand-in `regenerate` that writes one committed
 * file (`gen.txt`) and one gitignored file, so the check runs through real `git checkout-index`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitEnvironment } from '../../../../scripts/git-base';
import { staleGeneratedFiles } from '../../../../scripts/hooks/stale-generated-files';

/** What the stand-in generator writes. */
const FRESH = 'fresh\n';

/** The throwaway repository of the current case. */
let repo: string;

/** Run git in the fixture repository, away from any hook environment. */
const git = (...arguments_: string[]): void => {
    execFileSync('git', arguments_, { cwd: repo, env: gitEnvironment(), stdio: 'ignore' });
};

/** The stand-in `regenerate`: one committed output, one gitignored one. */
const regenerate = (tree: string): void => {
    writeFileSync(path.join(tree, 'gen.txt'), FRESH);
    writeFileSync(path.join(tree, 'ignored.txt'), 'built\n');
};

/** Stage `gen.txt` with the given content, plus the `.gitignore`. */
const stageGenerated = (content: string): void => {
    writeFileSync(path.join(repo, '.gitignore'), 'ignored.txt\n');
    writeFileSync(path.join(repo, 'gen.txt'), content);
    git('add', '.gitignore', 'gen.txt');
};

/** Run the check against the fixture. */
const check = (): string[] =>
    staleGeneratedFiles({ repo, regenerate, indexEnvironment: gitEnvironment() });

beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'stale-generated-test-'));
    git('init', '--quiet');
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('staleGeneratedFiles', () => {
    it('names a committed generated file that a regeneration would change', () => {
        stageGenerated('old\n');

        expect(check()).toEqual(['gen.txt']);
    });

    it('passes when every committed generated file is current', () => {
        stageGenerated(FRESH);

        expect(check()).toEqual([]);
    });

    it('judges the staged content, not a fresher copy left in the working tree', () => {
        stageGenerated('old\n');
        writeFileSync(path.join(repo, 'gen.txt'), FRESH);

        expect(check()).toEqual(['gen.txt']);
    });

    it('names a generated file the commit does not carry at all', () => {
        writeFileSync(path.join(repo, '.gitignore'), 'ignored.txt\n');
        git('add', '.gitignore');

        expect(check()).toEqual(['gen.txt']);
    });

    it('ignores what .gitignore covers, since postinstall rebuilds it', () => {
        stageGenerated(FRESH);

        expect(check()).not.toContain('ignored.txt');
    });

    it('does not touch the repository it inspects', () => {
        stageGenerated('old\n');

        check();

        expect(
            execFileSync('git', ['diff', '--name-only'], {
                cwd: repo,
                env: gitEnvironment(),
                encoding: 'utf8'
            })
        ).toBe('');
    });

    it('propagates a failing regeneration instead of passing', () => {
        stageGenerated(FRESH);

        expect(() =>
            staleGeneratedFiles({
                repo,
                regenerate: () => {
                    throw new Error('generator broke');
                },
                indexEnvironment: gitEnvironment()
            })
        ).toThrow('generator broke');
    });
});
