/**
 * `src/infrastructure/runtime/environment.ts` — the two coercions every reader shares.
 *
 * Small on purpose and tested exhaustively for it: every spelling of "read it as a number" or
 * "read it as a switch" in this codebase goes through these two functions, and the failure modes
 * they exist for are silent ones.
 */
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';

/**
 * The two coercions every reader shares.
 *
 * Exhaustive on the unusable inputs rather than the working one, because the working one was never
 * the problem: a variable is always a string, and the failures worth a suite are the strings that
 * are not the number or the switch someone meant. The pre-share spellings answered `NaN` for a
 * typo, which propagates into a `Date` or a `maxAge` and misbehaves with no error attached.
 */
const CANARY = 'NODE_TEST_CANARY';

const withValue = <T>(value: string | undefined, read: () => T): T => {
    const previous = process.env[CANARY];
    if (value === undefined) delete process.env[CANARY];
    else process.env[CANARY] = value;
    try {
        return read();
    } finally {
        if (previous === undefined) delete process.env[CANARY];
        else process.env[CANARY] = previous;
    }
};

describe('environmentNumber', () => {
    it('reads an integer a deployment set', () => {
        expect(withValue('900', () => environmentNumber(CANARY, 30))).toBe(900);
    });

    it('parses base 10, so a zero-padded value is not read as octal', () => {
        expect(withValue('0900', () => environmentNumber(CANARY, 30))).toBe(900);
    });

    it('tolerates surrounding whitespace, which .env files and CI injection both produce', () => {
        expect(withValue('  900  ', () => environmentNumber(CANARY, 30))).toBe(900);
    });

    it.each([
        ['unset', undefined],
        ['blank', ''],
        ['whitespace', '   '],
        ['prose', 'thirty']
    ])('falls back rather than answering NaN for %s', (_label, value) => {
        // The defect this helper exists for. `Number(process.env.X ?? 30)` answers NaN here, and
        // NaN minutes becomes an Invalid Date rather than an error anyone sees.
        expect(withValue(value, () => environmentNumber(CANARY, 30))).toBe(30);
    });

    it.each(['30m', '5mb', '1.5', '9 0 0'])(
        'refuses %p rather than reading the numeric prefix off it',
        (value) => {
            // Bare `parseInt` reads `5mb` as 5, so a mistyped upload ceiling becomes a five-BYTE
            // limit — an answer that looks configured and rejects every upload.
            expect(withValue(value, () => environmentNumber(CANARY, 90))).toBe(90);
        }
    );

    it('accepts zero and negatives when no minimum is declared', () => {
        expect(withValue('0', () => environmentNumber(CANARY, 30))).toBe(0);
        expect(withValue('-5', () => environmentNumber(CANARY, 30))).toBe(-5);
    });

    it('falls back below the declared minimum, because a size of zero is broken not smaller', () => {
        expect(withValue('0', () => environmentNumber(CANARY, 30, 1))).toBe(30);
        expect(withValue('-5', () => environmentNumber(CANARY, 30, 1))).toBe(30);
        expect(withValue('1', () => environmentNumber(CANARY, 30, 1))).toBe(1);
    });
});

describe('environmentFlag', () => {
    it.each(['1', 'true', 'TRUE', 'yes', 'on', ' true '])('reads %p as on', (value) => {
        expect(withValue(value, () => environmentFlag(CANARY, false))).toBe(true);
    });

    it.each(['0', 'false', 'FALSE', 'no', 'off', ' 0 '])('reads %p as off', (value) => {
        expect(withValue(value, () => environmentFlag(CANARY, true))).toBe(false);
    });

    it('accepts both vocabularies for the same flag', () => {
        // The bug this closes: kill switches were `!== '0'` and opt-ins `=== 'true'`, so
        // `NODE_DEMO=1` turned demo mode off and `NODE_RABBITMQ_ENABLED=false` left the queue on.
        expect(withValue('1', () => environmentFlag(CANARY, false))).toBe(true);
        expect(withValue('true', () => environmentFlag(CANARY, false))).toBe(true);
        expect(withValue('0', () => environmentFlag(CANARY, true))).toBe(false);
        expect(withValue('false', () => environmentFlag(CANARY, true))).toBe(false);
    });

    it.each([
        ['unset', undefined],
        ['blank', ''],
        ['unrecognised', 'maybe']
    ])('takes the default for %s rather than reading it as off', (_label, value) => {
        expect(withValue(value, () => environmentFlag(CANARY, true))).toBe(true);
        expect(withValue(value, () => environmentFlag(CANARY, false))).toBe(false);
    });
});
