/**
 * `zonedStartOfDay` and `endOfDayInZone` — the day edges of the shop's wall clock. The subject is
 * the boundary: the same instant is two different days in two zones, and a day of 23 or 25 hours
 * (DST) must not move the edge.
 */
import { dayInZone, endOfDayInZone, zonedStartOfDay } from '@domain-primitives/time';

describe('zonedStartOfDay', () => {
    it('is local midnight, an hour before UTC midnight in Rome in winter and two in summer', () => {
        expect(zonedStartOfDay(2026, 1, 5, 'Europe/Rome').toISOString()).toBe(
            '2026-01-04T23:00:00.000Z'
        );
        expect(zonedStartOfDay(2026, 7, 5, 'Europe/Rome').toISOString()).toBe(
            '2026-07-04T22:00:00.000Z'
        );
    });

    it('lands on the right side of a spring-forward and a fall-back', () => {
        // Rome springs forward on 2026-03-29 and falls back on 2026-10-25, both at 01:00 UTC, so
        // the day of the change is 23 and 25 hours long.
        const edges = [28, 29, 30].map((day) => zonedStartOfDay(2026, 3, day, 'Europe/Rome'));
        const fall = [25, 26].map((day) => zonedStartOfDay(2026, 10, day, 'Europe/Rome'));

        expect(edges.map((date) => date.toISOString())).toEqual([
            '2026-03-27T23:00:00.000Z',
            '2026-03-28T23:00:00.000Z',
            '2026-03-29T22:00:00.000Z'
        ]);
        expect(fall.map((date) => date.toISOString())).toEqual([
            '2026-10-24T22:00:00.000Z',
            '2026-10-25T23:00:00.000Z'
        ]);
    });

    it('handles a zone behind UTC, a half-hour zone and UTC itself', () => {
        expect(zonedStartOfDay(2026, 1, 5, 'America/New_York').toISOString()).toBe(
            '2026-01-05T05:00:00.000Z'
        );
        expect(zonedStartOfDay(2026, 1, 5, 'Asia/Kolkata').toISOString()).toBe(
            '2026-01-04T18:30:00.000Z'
        );
        expect(zonedStartOfDay(2026, 1, 5, 'UTC').toISOString()).toBe('2026-01-05T00:00:00.000Z');
    });
});

describe('endOfDayInZone', () => {
    const zones = ['Europe/Rome', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati', 'UTC'];

    it.each(zones)(
        'ends the printed day: the last millisecond is still that day, one more is the next (%s)',
        (zone) => {
            const instant = new Date('2026-12-29T22:30:00Z');
            const end = endOfDayInZone(instant, zone);

            expect(dayInZone(end, zone)).toBe(dayInZone(instant, zone));
            expect(dayInZone(new Date(end.getTime() + 1), zone)).not.toBe(dayInZone(instant, zone));
        }
    );

    it('is the end of the UTC day in UTC and a day LATER than it east of Greenwich', () => {
        // 23:30Z on 29 December is already 30 December in Rome: the day the buyer reads.
        expect(endOfDayInZone(new Date('2026-12-29T23:30:00Z'), 'UTC').toISOString()).toBe(
            '2026-12-29T23:59:59.999Z'
        );
        expect(endOfDayInZone(new Date('2026-12-29T23:30:00Z'), 'Europe/Rome').toISOString()).toBe(
            '2026-12-30T22:59:59.999Z'
        );
    });

    it('closes the evening of the printed day west of Greenwich, not an evening early', () => {
        // 03:00Z on 30 December is still the evening of the 29th in New York.
        expect(
            endOfDayInZone(new Date('2026-12-30T03:00:00Z'), 'America/New_York').toISOString()
        ).toBe('2026-12-30T04:59:59.999Z');
    });

    it('keeps the boundary on the calendar through a spring-forward and a fall-back', () => {
        // Rome: the 29 March day is 23 hours long, the 25 October day 25.
        expect(endOfDayInZone(new Date('2026-03-29T10:00:00Z'), 'Europe/Rome').toISOString()).toBe(
            '2026-03-29T21:59:59.999Z'
        );
        expect(endOfDayInZone(new Date('2026-10-25T10:00:00Z'), 'Europe/Rome').toISOString()).toBe(
            '2026-10-25T22:59:59.999Z'
        );
    });

    it('moves whole calendar days, not 24-hour blocks, across a DST change', () => {
        // Two days on from 27 March ends the 29th at 23:59 Rome summer time (21:59Z), not at 22:59Z.
        expect(
            endOfDayInZone(new Date('2026-03-27T10:00:00Z'), 'Europe/Rome', 2).toISOString()
        ).toBe('2026-03-29T21:59:59.999Z');
    });

    it('rolls over a month and a year end', () => {
        expect(endOfDayInZone(new Date('2026-12-31T10:00:00Z'), 'UTC', 1).toISOString()).toBe(
            '2027-01-01T23:59:59.999Z'
        );
        expect(endOfDayInZone(new Date('2028-02-28T10:00:00Z'), 'UTC', 1).toISOString()).toBe(
            '2028-02-29T23:59:59.999Z'
        );
    });
});
