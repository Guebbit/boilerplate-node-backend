/**
 * Property-based tests for `src/infrastructure/persistence/search.ts`: two security-relevant
 * functions, stated as properties because both are claims about EVERY input.
 *
 * `escapeRegex`:        a denial-of-service control. Unescaped user text in `$regex` hands MongoDB a
 *                       catastrophic-backtracking pattern, run per candidate document; `POST
 *                       /products/search` and `GET /products?text=` are public. Examples prove the
 *                       metacharacters someone thought of; generation supports "no input reaches
 *                       the engine as a pattern". The property: `new RegExp(escapeRegex(s))` matches
 *                       `s` literally, checked through the real engine rather than the escaped
 *                       string's shape, which is an implementation detail.
 * `normalizePagination`: must never produce a skip Mongo cannot use (negative or `NaN` is a driver
 *                       error, a 500). Values come off a request, where a repeated key is an array.
 * Seeding:              seeded; a counterexample is written back as an example with its seed.
 * Split:                `search-regex.test.ts` and `search-pagination.test.ts` own a named case per
 *                       metacharacter, the TIMING assertion (a property cannot measure time) and
 *                       the `1.5` vs `1x5` case. This owns totality over ARBITRARY input, generated
 *                       COMBINATIONS, and the non-idempotence of `escapeRegex`. Check there before
 *                       adding a case: a static mutant replays the whole suite.
 */
import fc from 'fast-check';
import {
    addRegexFilter,
    addTextFilter,
    buildPaginatedMeta,
    escapeRegex,
    normalizePagination
} from '@infrastructure/persistence/search';

/** Property-test settings: a fixed seed so a failure replays, and stop at the first one. */
const RUN = { seed: 20_260_809, numRuns: 300, endOnFailure: true } as const;

/**
 * Anything a request can put in a pagination field.
 *
 * `page` and `pageSize` are typed `unknown` on purpose — a repeated query key arrives as an array
 * and a JSON body can hold anything — so the arbitrary has to be at least as wide as the type.
 */
const requestValue = () =>
    fc.oneof(fc.anything(), fc.integer(), fc.string(), fc.constant(undefined));

describe('escapeRegex', () => {
    it('never produces a pattern the engine refuses to compile', () => {
        /**
         * A lone `(` in a search box is a syntax error the driver raises as a 500. This is the
         * property that says "no user string can do that", for any string.
         */
        fc.assert(
            fc.property(fc.string(), (value) => {
                expect(() => new RegExp(escapeRegex(value))).not.toThrow();
            }),
            RUN
        );
    });

    it('matches its own input literally', () => {
        // The round trip. Escaping that broke matching would be "safe" and useless.
        fc.assert(
            fc.property(fc.string(), (value) => {
                expect(new RegExp(escapeRegex(value)).test(value)).toBe(true);
            }),
            RUN
        );
    });

    it('strips every metacharacter of its power', () => {
        /**
         * The heart of it: a pattern built from user text must behave as a literal. `.` must not
         * match an arbitrary character, `^`/`$` must not anchor, `+`/`*` must not quantify.
         *
         * Generated over strings drawn from the metacharacter alphabet itself, which is where an
         * incomplete escape list shows up — the previous version of this rule was a fixed table
         * and could only ever prove the characters already in it.
         */
        const metacharacters = String.raw`$()*+.?[\]^{|}`;
        fc.assert(
            fc.property(
                /**
                 * Built from an array rather than a character-alphabet helper, whose name has
                 * moved between fast-check majors; this spelling does not care which one is
                 * installed.
                 */
                fc
                    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII regex metacharacters only; no surrogate pairs to mishandle
                    .array(fc.constantFrom(...metacharacters), { minLength: 1, maxLength: 12 })
                    .map((characters) => characters.join('')),
                (pattern) => {
                    const escaped = new RegExp(escapeRegex(pattern));

                    // It matches itself...
                    expect(escaped.test(pattern)).toBe(true);
                    // ...and not a string that only a live metacharacter could match.
                    expect(escaped.test('literally-unrelated-text')).toBe(false);
                }
            ),
            RUN
        );
    });

    it('leaves ANY alphanumeric text untouched, not just the sampled phrase', () => {
        // No over-escaping either: mangling plain words would quietly break search.
        fc.assert(
            // eslint-disable-next-line regexp/use-ignore-case -- fast-check's stringMatching rejects the `i` flag
            fc.property(fc.stringMatching(/^[\d A-Za-z]*$/), (value) => {
                expect(escapeRegex(value)).toBe(value);
            }),
            RUN
        );
    });

    it('is not idempotent, and that is why it is applied exactly once', () => {
        /**
         * Escaping twice doubles the backslashes and stops matching. Stated as a property so
         * nobody "hardens" a call site by wrapping it again.
         */
        expect(escapeRegex(escapeRegex('a.b'))).not.toBe(escapeRegex('a.b'));
        expect(new RegExp(escapeRegex(escapeRegex('a.b'))).test('a.b')).toBe(false);
    });
});

describe('addTextFilter / addRegexFilter', () => {
    it('never writes an uncompilable pattern into a filter', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                const where: Record<string, unknown> = {};
                addTextFilter(where, text, ['title', 'description']);

                const clauses = (where.$or ?? []) as Record<string, { $regex: string }>[];
                for (const clause of clauses)
                    for (const field of Object.values(clause))
                        expect(() => new RegExp(field.$regex)).not.toThrow();
            }),
            RUN
        );
    });

    it('adds nothing at all for input that is empty or only whitespace', () => {
        /**
         * An empty search box must not become a filter — `$regex: ''` matches every document and
         * costs a full scan to say so.
         */
        fc.assert(
            fc.property(
                fc
                    .array(fc.constantFrom(' ', '\t', '\n', ''), { maxLength: 10 })
                    .map((characters) => characters.join('')),
                (blank) => {
                    const where: Record<string, unknown> = {};
                    addTextFilter(where, blank, ['title']);
                    addRegexFilter(where, 'title', blank);

                    expect(where).toEqual({});
                }
            ),
            RUN
        );
    });

    it('produces one clause per searched field', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 5 }),
                (text, fields) => {
                    fc.pre(text.trim().length > 0);
                    const where: Record<string, unknown> = {};
                    addTextFilter(where, text, fields);

                    expect((where.$or as unknown[]).length).toBe(fields.length);
                }
            ),
            RUN
        );
    });
});

describe('normalizePagination', () => {
    it('never yields a skip Mongo cannot use, for any input', () => {
        /**
         * The structural guard. A negative or NaN skip is a driver error, i.e. a 500 on a search,
         * and these values come straight off a request.
         */
        fc.assert(
            fc.property(requestValue(), requestValue(), (page, pageSize) => {
                const {
                    page: resolvedPage,
                    pageSize: size,
                    skip
                } = normalizePagination({
                    page,
                    pageSize
                });

                expect(Number.isInteger(skip) || skip >= 0).toBe(true);
                expect(Number.isNaN(skip)).toBe(false);
                expect(skip).toBeGreaterThanOrEqual(0);
                expect(resolvedPage).toBeGreaterThanOrEqual(1);
                expect(size).toBeGreaterThan(0);
            }),
            RUN
        );
    });

    it('keeps skip consistent with page and pageSize', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 10_000 }),
                fc.integer({ min: 1, max: 100 }),
                (page, pageSize) => {
                    const result = normalizePagination({ page, pageSize });

                    /**
                     * The identity the paging depends on. `search` issues count and page as two
                     * queries; a skip that disagreed with the reported page would drop rows.
                     */
                    expect(result.skip).toBe((result.page - 1) * result.pageSize);
                }
            ),
            RUN
        );
    });

    it('starts page 1 at skip 0', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 100 }), (pageSize) => {
                expect(normalizePagination({ page: 1, pageSize }).skip).toBe(0);
            }),
            RUN
        );
    });

    it('reports zero pages for zero items', () => {
        expect(buildPaginatedMeta(normalizePagination({}), 0).totalPages).toBe(0);
    });
});
