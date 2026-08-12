import { addRegexFilter, addTextFilter, escapeRegex } from '@infrastructure/persistence/search';

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
     * The exploit, defused. Asserted structurally rather than by stopwatch: every metacharacter
     * in `(a+)+$` comes back escaped, which is precisely what leaves the engine nothing to
     * backtrack over. A wall-clock threshold would assert the same property by proxy and fail on
     * a loaded CI runner for reasons that have nothing to do with the code.
     */
    it('renders a catastrophic backtracking pattern harmless', () => {
        const evil = '(a+)+$';

        // Nothing left that the engine reads as a group, a quantifier or an anchor.
        expect(escapeRegex(evil)).toBe(String.raw`\(a\+\)\+\$`);
        expect(new RegExp(escapeRegex(evil)).test('a'.repeat(40) + '!')).toBe(false);
        // It still matches the one string it should: the literal text itself.
        expect(new RegExp(escapeRegex(evil)).test(`x${evil}y`)).toBe(true);
    });

    it('produces a pattern that matches the literal text a user typed', () => {
        expect(new RegExp(escapeRegex('50% (off)')).test('sale: 50% (off) today')).toBe(true);
        expect(new RegExp(escapeRegex('1.5')).test('1x5')).toBe(false);
    });

    /*
     * The cases above are the named, memorable ones: a specific metacharacter, a specific
     * expectation. The general claim — "escapes whatever it is given" — belongs in
     * `search.property.test.ts`, where it is generated over arbitrary input rather than sampled
     * over a handful of strings someone thought of. Hand-picked examples cannot support a claim
     * quantified over all inputs; they only illustrate it.
     */
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

    it.each([undefined, null, '', '   '])('adds nothing for %p', (value) => {
        const where: Record<string, unknown> = {};

        addTextFilter(where, value, ['title']);
        addRegexFilter(where, 'email', value);

        expect(where).toEqual({});
    });
});
