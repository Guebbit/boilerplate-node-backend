/**
 * Property-based tests — `src/infrastructure/persistence/search.ts`.
 *
 * Two functions here are security-relevant rather than merely correct, and both are stated as
 * properties because both are claims about EVERY input:
 *
 *   **`escapeRegex` is a denial-of-service control.** `$regex` with unescaped user text lets an
 *   anonymous caller hand MongoDB a catastrophic-backtracking pattern that it evaluates
 *   server-side against every candidate document — seconds of CPU per document from a handful of
 *   characters. `POST /products/search` and `GET /products?text=` are public. A table of examples
 *   proves the metacharacters someone thought of are escaped; only generation over arbitrary
 *   strings supports "no input reaches the engine as a pattern".
 *
 *   The property that expresses this exactly is: for any subject `s`, `new RegExp(escapeRegex(s))`
 *   matches `s` and matches nothing else it should not — i.e. escaping is LITERAL matching. That
 *   is checked below by round-tripping through the real `RegExp` engine rather than by asserting
 *   on the escaped string's shape, because the shape is an implementation detail and the
 *   behaviour is the contract.
 *
 *   **`normalizePagination` must never produce a skip Mongo cannot use.** A negative or `NaN`
 *   skip is a driver error, i.e. a 500 on a search. The values arrive straight off a request,
 *   where a repeated query key is an array and a JSON body can hold anything.
 *
 * Seeded, and any counterexample gets written back as an example with its seed.
 *
 * ── SPLIT WITH `search-regex.test.ts` / `search-pagination.test.ts` ──────────────────────────
 * Those two files are example-based and they are NOT redundant with this one; each owns the facts
 * the other cannot state, and the division is deliberate:
 *
 *   they own — a named case per metacharacter (better diagnostics than a generated blob), the
 *              TIMING assertion that a catastrophic pattern is defused (a property cannot measure
 *              elapsed time), and the negative case that `1.5` must not match `1x5`;
 *   this owns — totality over ARBITRARY input, generated COMBINATIONS of metacharacters rather
 *              than one at a time, and the non-idempotence of `escapeRegex`.
 *
 * Before adding a case here, check there. A fact asserted twice is a fact maintained twice — and
 * it is worse than it looks in this repo, because a static mutant replays the entire suite.
 */
import fc from 'fast-check';
import {
    addRegexFilter,
    addTextFilter,
    buildPaginatedMeta,
    escapeRegex,
    normalizePagination
} from '@infrastructure/persistence/search';

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
        // A lone `(` in a search box is a syntax error the driver raises as a 500. This is the
        // property that says "no user string can do that", for any string.
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
        // The heart of it: a pattern built from user text must behave as a literal. `.` must not
        // match an arbitrary character, `^`/`$` must not anchor, `+`/`*` must not quantify.
        //
        // Generated over strings drawn from the metacharacter alphabet itself, which is where an
        // incomplete escape list shows up — the previous version of this rule was a fixed table
        // and could only ever prove the characters already in it.
        const metacharacters = String.raw`$()*+.?[\]^{|}`;
        fc.assert(
            fc.property(
                // Built from an array rather than a character-alphabet helper, whose name has
                // moved between fast-check majors; this spelling does not care which one is
                // installed.
                fc
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
            fc.property(fc.stringMatching(/^[\d A-Za-z]*$/), (value) => {
                expect(escapeRegex(value)).toBe(value);
            }),
            RUN
        );
    });

    it('is not idempotent, and that is why it is applied exactly once', () => {
        // Escaping twice doubles the backslashes and stops matching. Stated as a property so
        // nobody "hardens" a call site by wrapping it again.
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
        // An empty search box must not become a filter — `$regex: ''` matches every document and
        // costs a full scan to say so.
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
        // The structural guard. A negative or NaN skip is a driver error, i.e. a 500 on a search,
        // and these values come straight off a request.
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

                    // The identity the paging depends on. `search` issues count and page as two
                    // queries; a skip that disagreed with the reported page would drop rows.
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
