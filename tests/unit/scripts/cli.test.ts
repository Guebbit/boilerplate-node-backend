/**
 * Script command line: the switches and values a script reads from `process.argv`.
 *
 * Lenient on purpose, so a flag the script does not know (one npm adds, or a sibling script's)
 * never throws.
 */
import { flagValue, hasFlag } from '../../../scripts/cli';

const originalArguments = process.argv;

/** Runs the script as if it was started with these arguments after `node script`. */
const startedWith = (...rest: string[]): void => {
    process.argv = ['node', 'script.ts', ...rest];
};

afterEach(() => {
    process.argv = originalArguments;
});

describe('hasFlag', () => {
    it('is true when the switch is given', () => {
        startedWith('--check');
        expect(hasFlag('check')).toBe(true);
    });

    it('is false when the switch is absent', () => {
        startedWith('--other');
        expect(hasFlag('check')).toBe(false);
    });

    it('finds a switch among positionals and unknown flags', () => {
        startedWith('report.json', '--unknown=1', '--dry-run');
        expect(hasFlag('dry-run')).toBe(true);
    });

    it('does not mistake a valued flag of another name for the switch', () => {
        startedWith('--only=shard-03');
        expect(hasFlag('force')).toBe(false);
    });
});

describe('flagValue', () => {
    it('reads both `--flag value` and `--flag=value`', () => {
        startedWith('--limit', '2');
        expect(flagValue('limit')).toBe('2');
        startedWith('--limit=3');
        expect(flagValue('limit')).toBe('3');
    });

    it('is undefined when the flag is absent', () => {
        startedWith('--other=1');
        expect(flagValue('limit')).toBeUndefined();
    });
});
