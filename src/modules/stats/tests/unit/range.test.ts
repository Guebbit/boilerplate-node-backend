/**
 * The rules a requested period must pass: real days, in order, at most two years, at most 400
 * buckets. A day-by-day chart of two years is the case the bucket cap exists for.
 */
import { MAX_BUCKETS, MAX_RANGE_DAYS, checkRange, previousOf } from '../../domain/range';
import { formatDay } from '../../domain/calendar';

describe('checkRange', () => {
    it('accepts a period and lists every bucket start, the first possibly before `from`', () => {
        // 2026-03-11 is a Wednesday, so the first week bucket starts on Monday the 9th.
        const checked = checkRange({ from: '2026-03-11', to: '2026-03-24', interval: 'week' });

        expect(
            'range' in checked && checked.range.bucketStarts.map((day) => formatDay(day))
        ).toEqual(['2026-03-09', '2026-03-16', '2026-03-23']);
    });

    it.each([
        [{ from: '2026-02-30', to: '2026-03-01' }, 'invalid-day'],
        [{ from: '2026-03-02', to: '2026-03-01' }, 'out-of-order']
    ])('refuses %j as %s', (input, refusal) => {
        expect(checkRange({ ...input, interval: 'day' })).toEqual({ refusal });
    });

    it('allows exactly two years of days and refuses one more', () => {
        // 2026-01-01 to 2028-01-01 is 731 days, both ends counted.
        expect(MAX_RANGE_DAYS).toBe(731);
        expect(
            checkRange({ from: '2026-01-01', to: '2028-01-01', interval: 'month' })
        ).toHaveProperty('range');
        expect(checkRange({ from: '2026-01-01', to: '2028-01-02', interval: 'month' })).toEqual({
            refusal: 'too-long'
        });
    });

    it('refuses a day-by-day period that would need more than 400 buckets', () => {
        expect(MAX_BUCKETS).toBe(400);
        expect(checkRange({ from: '2026-01-01', to: '2027-02-05', interval: 'day' })).toEqual({
            refusal: 'too-many-buckets'
        });
        expect(
            checkRange({ from: '2026-01-01', to: '2027-02-04', interval: 'week' })
        ).toHaveProperty('range');
    });
});

describe('previousOf', () => {
    it('is the equal-length period ending the day before', () => {
        const checked = checkRange({ from: '2026-03-08', to: '2026-03-14', interval: 'day' });
        if (!('range' in checked)) throw new Error('range refused');

        const previous = previousOf(checked.range);

        expect([formatDay(previous.from), formatDay(previous.to)]).toEqual([
            '2026-03-01',
            '2026-03-07'
        ]);
    });
});
