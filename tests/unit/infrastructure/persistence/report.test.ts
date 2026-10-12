/**
 * `report.ts` — the `$dateTrunc` every grouped read buckets with, and the decimal read-back. The
 * subject is the one option that only means something for one unit: Monday-first weeks.
 */
import { bucketOf, decimalSum, numberOf } from '@infrastructure/persistence/report';

const window = (interval: 'day' | 'week' | 'month') => ({
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    interval,
    timeZone: 'Europe/Rome'
});

describe('bucketOf', () => {
    it('truncates in the window zone, to the window unit', () => {
        expect(bucketOf('$paidAt', window('day'))).toEqual({
            $dateTrunc: { date: '$paidAt', unit: 'day', timezone: 'Europe/Rome' }
        });
    });

    it('sends Monday as the start of the week for weeks, and only for weeks', () => {
        expect(bucketOf('$paidAt', window('week')).$dateTrunc).toMatchObject({
            unit: 'week',
            startOfWeek: 'monday'
        });
        expect(bucketOf('$paidAt', window('month')).$dateTrunc).not.toHaveProperty('startOfWeek');
    });
});

describe('decimalSum', () => {
    it('converts to Decimal128 before summing, so cents add exactly', () => {
        expect(decimalSum('$netTotal')).toEqual({ $sum: { $toDecimal: '$netTotal' } });
    });
});

describe('numberOf', () => {
    it('reads a decimal by its text, a number as itself, and anything else as 0', () => {
        expect(numberOf({ toString: () => '12.30' })).toBe(12.3);
        expect(numberOf(4)).toBe(4);
        expect(numberOf(undefined)).toBe(0);
        expect(numberOf('not a number')).toBe(0);
        expect(numberOf(NaN)).toBe(0);
    });
});
