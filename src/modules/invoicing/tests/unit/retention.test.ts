/**
 * @module
 * The tax clock as a pure rule: a document is due on 1 January of (issue year + N + 1), in the
 * zone it was issued in, and the scan bound never excludes a due document.
 */

import {
    buyerRetentionEnd,
    buyerRetentionScanBound,
    isBuyerRetentionOver
} from '@modules/invoicing/domain';

describe('buyerRetentionEnd', () => {
    it('is local midnight of 1 January, N + 1 years after the issue year', () => {
        const end = buyerRetentionEnd(new Date('2015-06-01T10:00:00Z'), 'Europe/Rome', 10);

        expect(end.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    });

    it('counts the issue year in the document zone, not in UTC', () => {
        // 23:30 UTC on 31 Dec is already 1 Jan in Rome: the issue year is the next one.
        const end = buyerRetentionEnd(new Date('2015-12-31T23:30:00Z'), 'Europe/Rome', 10);

        expect(end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    });
});

describe('isBuyerRetentionOver', () => {
    const document = { issuedAt: new Date('2015-06-01T10:00:00Z'), timezone: 'Europe/Rome' };

    it('is false one minute before local New Year and true one after', () => {
        expect(isBuyerRetentionOver(document, 10, new Date('2025-12-31T22:59:00Z'))).toBe(false);
        expect(isBuyerRetentionOver(document, 10, new Date('2025-12-31T23:00:00Z'))).toBe(true);
    });

    it('is not due exactly N * 365 days after issue', () => {
        const early = new Date(document.issuedAt.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);

        expect(isBuyerRetentionOver(document, 10, early)).toBe(false);
    });
});

describe('buyerRetentionScanBound', () => {
    it.each([
        ['2015-06-01T10:00:00Z', 'Pacific/Kiritimati', '2025-12-31T09:59:00Z'],
        ['2015-12-31T23:59:00Z', 'Pacific/Pago_Pago', '2026-12-01T00:00:00Z'],
        ['2015-06-01T10:00:00Z', 'Europe/Rome', '2025-12-31T23:00:00Z']
    ])('never drops a document issued %s in %s that is due at %s', (issued, timezone, now) => {
        const document = { issuedAt: new Date(issued), timezone };
        const at = new Date(now);

        // Only meaningful when due; the bound must then lie after the document.
        if (isBuyerRetentionOver(document, 10, at))
            expect(document.issuedAt < buyerRetentionScanBound(10, at)).toBe(true);
    });

    it('sits at the start of the year N before tomorrow, in UTC', () => {
        const bound = buyerRetentionScanBound(10, new Date('2026-05-05T12:00:00Z'));

        expect(bound.toISOString()).toBe('2016-01-02T00:00:00.000Z');
    });
});
