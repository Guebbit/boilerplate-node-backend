/**
 * `report.ts` — the `$dateTrunc` every grouped read buckets with. The subject is the one option
 * that only means something for one unit: Monday-first weeks.
 */
import { bucketOf } from '@infrastructure/persistence/report';

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
