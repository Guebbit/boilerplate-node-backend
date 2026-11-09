import {
    CommandTimeoutError,
    runWithTimeout
} from '../../../../scripts/contracts/run-with-timeout';

describe('runWithTimeout', () => {
    it('kills a command that never exits and names it in the error', () => {
        expect(() =>
            runWithTimeout('node', ['-e', 'setInterval(() => {}, 1000)'], {}, 300)
        ).toThrow(CommandTimeoutError);
        expect(() =>
            runWithTimeout('node', ['-e', 'setInterval(() => {}, 1000)'], {}, 300)
        ).toThrow(/node -e setInterval.*300 ms/);
    });

    it('rethrows a non-timeout failure untouched', () => {
        expect(() => runWithTimeout('node', ['-e', 'process.exit(3)'], {}, 10_000)).toThrow(
            /Command failed/
        );
    });
});
