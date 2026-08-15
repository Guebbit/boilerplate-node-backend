import {
    addRegexFilter,
    addTextFilter,
    escapeRegex,
    toSearchPattern
} from '@infrastructure/persistence/search';

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

/**
 * A NUL reaching `$regex` was a **500 on a public endpoint**, found by `test:fuzz` with a rolled
 * seed (`RANDOM_DATA_SEED=108919307`) and reproduced on `tag`, `category` and `text` alike.
 *
 * MongoDB compiles the pattern as a C string, so it rejects one containing a NUL — and
 * `escapeRegex` never covered it, correctly: escaping is about metacharacters, and a NUL is not a
 * metacharacter but a byte the pattern language cannot hold at all. That is why the strip is a
 * separate step rather than another entry in the escape list.
 */
describe('control characters', () => {
    const NUL = String.fromCodePoint(0);

    it('strips a NUL but keeps the search the caller meant', () => {
        // The realistic shape: an injected NUL alongside real text. Dropping the whole term would
        // turn a valid search into "everything"; keeping the NUL is the 500.
        expect(toSearchPattern(`shoes${NUL}`)).toBe('shoes');
        expect(toSearchPattern(`${NUL}blue${NUL}shoes`)).toBe('blueshoes');
    });

    it.each([
        ['NUL', String.fromCodePoint(0)],
        ['bell', String.fromCodePoint(7)],
        ['backspace', String.fromCodePoint(8)],
        ['escape', String.fromCodePoint(27)],
        ['DEL', String.fromCodePoint(127)]
    ])('treats a term that is only %s as blank rather than as a match-all', (_name, character) => {
        // `undefined`, not `''`. `$regex: ''` matches every document, so returning an empty
        // pattern would invert the filter instead of dropping it.
        expect(toSearchPattern(character)).toBeUndefined();
    });

    it('drops the filter entirely, on all three paths that build a pattern', () => {
        const where: Record<string, unknown> = {};

        addTextFilter(where, NUL, ['title', 'description']);
        addRegexFilter(where, 'email', NUL);

        // Not "a filter matching nothing" and not "a filter matching everything" — no filter.
        expect(where).toEqual({});
    });

    it('still escapes metacharacters that survive the strip', () => {
        // The two steps compose: strip what cannot be held, escape what would be interpreted.
        expect(toSearchPattern(`(a+)+$${NUL}`)).toBe(String.raw`\(a\+\)\+\$`);
    });
});
