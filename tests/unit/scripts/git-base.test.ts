/**
 * `mergeBase` and `gitEnvironment`. `mergeBase` is the shared ref resolver
 * `check-asyncapi-breaking.ts` and `mutation/run-diff.ts` both diff against; its resolver is
 * injected, so no test here touches real git.
 */
import { setProcessEnvironment } from '@tests/environment';
import { gitEnvironment, mergeBase } from '../../../scripts/git-base';

describe('mergeBase', () => {
    it('returns the direct resolution when the requested base resolves', () => {
        const resolve = jest.fn((ref: string) => (ref === 'origin/main' ? 'abc123' : undefined));

        expect(mergeBase('origin/main', 'test-script', resolve)).toBe('abc123');
        expect(resolve).toHaveBeenCalledTimes(1);
    });

    it("falls back to origin/HEAD when the default 'origin/main' does not resolve", () => {
        const resolve = jest.fn((ref: string) => (ref === 'origin/HEAD' ? 'def456' : undefined));

        expect(mergeBase('origin/main', 'test-script', resolve)).toBe('def456');
        expect(resolve).toHaveBeenNthCalledWith(1, 'origin/main');
        expect(resolve).toHaveBeenNthCalledWith(2, 'origin/HEAD');
    });

    it('skips (returns undefined) when neither origin/main nor origin/HEAD resolve', () => {
        const resolve = jest.fn(() => undefined);
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        expect(mergeBase('origin/main', 'test-script', resolve)).toBeUndefined();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test-script'));

        logSpy.mockRestore();
    });

    it('exits 2 on an explicit --base that fails to resolve, without trying origin/HEAD', () => {
        const resolve = jest.fn(() => undefined);
        /**
         * `process.exit` really does end the process; the throw is what stops this function from
         * reading on to the origin/HEAD fallback, the same as it would in reality.
         */
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit');
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => mergeBase('HEAD~3', 'test-script', resolve)).toThrow('process.exit');

        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledWith('HEAD~3');
        expect(exitSpy).toHaveBeenCalledWith(2);

        exitSpy.mockRestore();
        errorSpy.mockRestore();
    });
});

describe('gitEnvironment', () => {
    /** The documented minimum: variables git reads that must never reach a nested call. */
    const SANDBOX = [
        'GIT_DIR',
        'GIT_WORK_TREE',
        'GIT_INDEX_FILE',
        'GIT_COMMON_DIR',
        'GIT_PREFIX',
        'GIT_AUTHOR_NAME',
        'GIT_AUTHOR_EMAIL',
        'GIT_COMMITTER_NAME',
        'GIT_COMMITTER_DATE',
        'GIT_CONFIG_PARAMETERS',
        'GIT_CONFIG_COUNT',
        'GIT_CONFIG_KEY_0',
        'GIT_CONFIG_VALUE_0'
    ];

    it('drops the repository-local, identity and injected-config variables', () => {
        setProcessEnvironment(Object.fromEntries(SANDBOX.map((name) => [name, 'x'])));

        const environment = gitEnvironment();

        expect(SANDBOX.filter((name) => name in environment)).toEqual([]);
    });

    it('drops any other GIT_* variable too, and keeps the rest', () => {
        setProcessEnvironment({ KEEP_ME: '1', GIT_EXEC_PATH: '/usr/lib/git-core' });

        const environment = gitEnvironment();

        expect(environment.GIT_EXEC_PATH).toBeUndefined();
        expect(environment.KEEP_ME).toBe('1');
    });
});
