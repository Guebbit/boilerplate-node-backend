/**
 * `src/infrastructure/runtime/environment.ts` — the one vocabulary a switch is written in.
 *
 * An environment variable, a query string and a form field all spell "on" and "off" the same way,
 * and a word outside the vocabulary must answer "not a switch" rather than guess.
 */
import { FALSY_WORDS, TRUTHY_WORDS, parseBooleanWord } from '@infrastructure/runtime/environment';

describe('parseBooleanWord', () => {
    it.each(['1', 'true', 'TRUE', 'yes', 'on', ' true '])('reads %p as on', (word) => {
        expect(parseBooleanWord(word)).toBe(true);
    });

    it.each(['0', 'false', 'FALSE', 'no', 'off', ' 0 '])('reads %p as off', (word) => {
        expect(parseBooleanWord(word)).toBe(false);
    });

    it.each(['', '  ', 'maybe', 'constructor', '__proto__'])(
        'says %p is not a switch, prototype names included',
        (word) => {
            expect(parseBooleanWord(word)).toBeUndefined();
        }
    );

    it('exposes the same words it decodes, for the config fields to share', () => {
        expect(TRUTHY_WORDS.every((word) => parseBooleanWord(word) === true)).toBe(true);
        expect(FALSY_WORDS.every((word) => parseBooleanWord(word) === false)).toBe(true);
    });
});
