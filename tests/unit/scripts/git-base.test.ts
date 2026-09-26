/**
 * `mergeBase` — the shared ref resolver `check-asyncapi-breaking.ts` and `mutation/run-diff.ts`
 * both diff against. The resolver is injected, so no test here touches real git.
 */
import { mergeBase } from '../../../scripts/git-base';

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
        // `process.exit` really does end the process; the throw is what stops this function from
        // reading on to the origin/HEAD fallback, the same as it would in reality.
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
