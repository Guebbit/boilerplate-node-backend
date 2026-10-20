/**
 * `zonedStartOfDay` — the day edge of the shop's wall clock. The subject is the boundary: the same
 * instant is two different days in two zones, and a day of 23 or 25 hours (DST) must not move the
 * edge.
 */
import { zonedStartOfDay } from '@domain-primitives/time';

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
