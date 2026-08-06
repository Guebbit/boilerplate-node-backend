import { addRegexFilter, addTextFilter, escapeRegex } from '@repositories/search';

/**
 * Client text reaches MongoDB's `$regex`, and MongoDB evaluates the pattern server-side against
 * every candidate document. Unescaped, that is a remote denial of service on a PUBLIC endpoint:
 * `POST /products/search` and `GET /products?text=` need no token, and a catastrophic
 * backtracking pattern costs seconds of CPU per document from a handful of characters.
 *
 * It is also a correctness fix. `.` matches everything, `^` anchors, and a lone `(` is a syntax
 * error the driver raises as a 500 — so someone searching for "50% (off)" got an error rather
 * than products.
 */

/** Every metacharacter that changes how a pattern is interpreted. */
const METACHARACTERS = ['.', '*', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'];

describe('escapeRegex', () => {
    it.each(METACHARACTERS)('escapes %s so it matches itself', (character) => {
        const escaped = escapeRegex(character);

        expect(new RegExp(escaped).test(character)).toBe(true);
    });

    it('leaves ordinary text untouched', () => {
        expect(escapeRegex('blue running shoes')).toBe('blue running shoes');
    });

    /**
     * The exploit, defused: the escaped form is a literal string, so there is nothing to
     * backtrack. Asserted by timing, because "it is now literal" is exactly what makes it fast.
     */
    it('renders a catastrophic backtracking pattern harmless', () => {
        const evil = '(a+)+$';
        const subject = 'a'.repeat(40) + '!';

        const started = process.hrtime.bigint();
        expect(new RegExp(escapeRegex(evil)).test(subject)).toBe(false);
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

        expect(elapsedMs).toBeLessThan(50);
    });

    it('produces a pattern that matches the literal text a user typed', () => {
        expect(new RegExp(escapeRegex('50% (off)')).test('sale: 50% (off) today')).toBe(true);
        expect(new RegExp(escapeRegex('1.5')).test('1x5')).toBe(false);
    });

    it('never produces an invalid pattern, whatever it is given', () => {
        // A lone backslash is written with an escape rather than String.raw: a trailing
        // backslash inside String.raw escapes the closing backtick and never terminates.
        for (const value of ['(', '[', '\\', '*', '+?', '{2,', '(((', String.raw`\\(`])
            expect(() => new RegExp(escapeRegex(value))).not.toThrow();
    });
});

describe('the filters that reach MongoDB', () => {
    it('escapes the text filter across every field', () => {
        const where: Record<string, unknown> = {};

        addTextFilter(where, '(a+)+$', ['title', 'description']);

        for (const clause of where.$or as { [k: string]: { $regex: string } }[])
            expect(Object.values(clause)[0]!.$regex).not.toBe('(a+)+$');
    });

    it('escapes a single-field filter', () => {
        const where: Record<string, unknown> = {};

        addRegexFilter(where, 'email', '.*');

        expect((where.email as { $regex: string }).$regex).toBe(String.raw`\.\*`);
    });

    // eslint-disable-next-line unicorn/no-null -- these helpers accept null, so it must be tested
    it.each([undefined, null, '', '   '])('adds nothing for %p', (value) => {
        const where: Record<string, unknown> = {};

        addTextFilter(where, value, ['title']);
        addRegexFilter(where, 'email', value);

        expect(where).toEqual({});
    });
});
