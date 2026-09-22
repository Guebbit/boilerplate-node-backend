/**
 * The contract scalars more than one endpoint accepts.
 *
 * Each of these exists so the same question cannot get two answers across endpoints: `hardDelete`
 * read as presence makes `?hardDelete=false` permanently delete the record, and a `pageSize` bound
 * declared per-controller makes the same out-of-range request answer 422 on one endpoint and a
 * clamped 200 on the next.
 */
import {
    hardDeleteSchema,
    optionalBooleanSchema,
    pageSchema,
    pageSizeSchema,
    paginationSchema
} from '@infrastructure/http/schemas';

describe('hardDeleteSchema', () => {
    // `readInput` has already decoded the string spellings a URL can carry by the time this runs,
    // so what arrives here is a real boolean or something that was never one.
    it.each([true, false])('accepts the boolean %p', (value) => {
        expect(hardDeleteSchema.parse(value)).toBe(value);
    });

    // The whole point of the schema: read as presence, this would be `true` and delete the record.
    it('does not treat a decoded false as a request to hard-delete', () => {
        expect(hardDeleteSchema.parse(false)).toBe(false);
    });

    it.each([undefined, '', null])('reads the absent value %p as soft delete', (value) => {
        expect(hardDeleteSchema.parse(value)).toBe(false);
    });

    // Rejected rather than guessed at: a value nobody can interpret must not silently become
    // the destructive option.
    it.each(['maybe', 'not-a-boolean', 1, {}])('rejects %p', (value) => {
        expect(hardDeleteSchema.safeParse(value).success).toBe(false);
    });
});

describe('optionalBooleanSchema', () => {
    // The full vocabulary, not just 'true'/'false' — a query string, a multipart form and an
    // analytics-consent checkbox all spell "on"/"off" more than one way.
    it.each(['true', 'yes', '1', 'on'])('decodes %p as true', (value) => {
        expect(optionalBooleanSchema.parse(value)).toBe(true);
    });

    it.each(['false', 'no', '0', 'off'])('decodes %p as false', (value) => {
        expect(optionalBooleanSchema.parse(value)).toBe(false);
    });

    it.each([undefined, '', null])('leaves the absent value %p undefined', (value) => {
        expect(optionalBooleanSchema.parse(value)).toBeUndefined();
    });

    // Rejected rather than silently coerced to a fixed default — a filter nobody can interpret
    // must not quietly become "no filter" or "false".
    it('rejects an unrecognised word with a 422-worthy failure', () => {
        expect(optionalBooleanSchema.safeParse('garbage').success).toBe(false);
    });
});

describe('pageSchema / pageSizeSchema', () => {
    it('coerces the text a query string carries', () => {
        expect(pageSchema.parse('3')).toBe(3);
        expect(pageSizeSchema.parse('25')).toBe(25);
    });

    // Absent stays absent — `normalizePagination` is the single authority on the defaults, and a
    // second set here could only be overwritten by it.
    it.each([undefined, '', null])('leaves the absent value %p undefined', (value) => {
        expect(pageSchema.parse(value)).toBeUndefined();
        expect(pageSizeSchema.parse(value)).toBeUndefined();
    });

    it.each([0, -1, 'abc'])('rejects the page %p', (value) => {
        expect(pageSchema.safeParse(value).success).toBe(false);
    });

    // openapi.yaml declares `maximum: 100`; an endpoint that ignored it was advertising a limit
    // it never applied.
    it('rejects a page size beyond the declared maximum', () => {
        expect(pageSizeSchema.safeParse(101).success).toBe(false);
        expect(pageSizeSchema.parse(100)).toBe(100);
    });

    // A fractional page produced a fractional `skip`, which is not a page.
    it('rejects a fractional page', () => {
        expect(pageSchema.safeParse(1.5).success).toBe(false);
    });
});

describe('paginationSchema', () => {
    it('parses the pair together', () => {
        expect(paginationSchema.parse({ page: '2', pageSize: '5' })).toEqual({
            page: 2,
            pageSize: 5
        });
    });

    it('reports which of the two was wrong', () => {
        const result = paginationSchema.safeParse({ page: '1', pageSize: '500' });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toEqual(['pageSize']);
    });
});
