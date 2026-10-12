/**
 * Calendar arithmetic — days as three numbers, no clock and no zone. The subject is the edges: a
 * date the month does not have, a week that starts on Monday, a month that ends in December.
 */
import {
    addDays,
    bucketStart,
    formatDay,
    inclusiveDays,
    nextBucket,
    parseDay
} from '../../domain/calendar';

describe('parseDay', () => {
    it('reads a real date', () => {
        expect(parseDay('2026-03-05')).toEqual({ year: 2026, month: 3, day: 5 });
    });

    it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-3-5', '26-03-05', '', 'tomorrow'])(
        'refuses %s',
        (text) => {
            expect(parseDay(text)).toBeUndefined();
        }
    );

    it('accepts 29 February only in a leap year', () => {
        expect(parseDay('2028-02-29')).toBeDefined();
        expect(parseDay('2026-02-29')).toBeUndefined();
    });
});

describe('addDays and inclusiveDays', () => {
    it('crosses a month and a year, both ways', () => {
        expect(formatDay(addDays({ year: 2026, month: 12, day: 31 }, 1))).toBe('2027-01-01');
        expect(formatDay(addDays({ year: 2026, month: 3, day: 1 }, -1))).toBe('2026-02-28');
    });

    it('counts both ends', () => {
        const day = { year: 2026, month: 3, day: 5 };

        expect(inclusiveDays(day, day)).toBe(1);
        expect(inclusiveDays(day, addDays(day, 6))).toBe(7);
        expect(inclusiveDays(addDays(day, 1), day)).toBe(0);
    });
});

describe('bucketStart and nextBucket', () => {
    // 2026-03-11 is a Wednesday.
    const wednesday = { year: 2026, month: 3, day: 11 };

    it('keeps a day, goes back to Monday for a week, to the first for a month', () => {
        expect(formatDay(bucketStart(wednesday, 'day'))).toBe('2026-03-11');
        expect(formatDay(bucketStart(wednesday, 'week'))).toBe('2026-03-09');
        expect(formatDay(bucketStart(wednesday, 'month'))).toBe('2026-03-01');
    });

    it('puts a Sunday at the END of its week, not the start of the next', () => {
        expect(formatDay(bucketStart({ year: 2026, month: 3, day: 15 }, 'week'))).toBe(
            '2026-03-09'
        );
        expect(formatDay(bucketStart({ year: 2026, month: 3, day: 9 }, 'week'))).toBe('2026-03-09');
    });

    it('steps one bucket on, December into January included', () => {
        expect(formatDay(nextBucket(wednesday, 'day'))).toBe('2026-03-12');
        expect(formatDay(nextBucket({ year: 2026, month: 3, day: 9 }, 'week'))).toBe('2026-03-16');
        expect(formatDay(nextBucket({ year: 2026, month: 12, day: 1 }, 'month'))).toBe(
            '2027-01-01'
        );
    });
});
