/**
 * `yearInZone` — the year a numbered series is cut at. The subject is the boundary: the same
 * instant is two different years in UTC and in the shop's zone.
 */
import { yearInZone } from '../../domain/shop-time';

describe('yearInZone', () => {
    it('puts 00:30 on 1 January in Rome into the new year, while UTC is still in the old one', () => {
        const instant = new Date('2026-12-31T23:30:00Z');

        expect(instant.getUTCFullYear()).toBe(2026);
        expect(yearInZone(instant, 'Europe/Rome')).toBe(2027);
    });

    it('keeps 23:30 on 31 December in New York in the old year, while UTC has moved on', () => {
        const instant = new Date('2027-01-01T04:30:00Z');

        expect(instant.getUTCFullYear()).toBe(2027);
        expect(yearInZone(instant, 'America/New_York')).toBe(2026);
    });

    it('agrees with UTC away from the boundary', () => {
        expect(yearInZone(new Date('2026-06-15T12:00:00Z'), 'UTC')).toBe(2026);
    });
});
