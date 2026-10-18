/**
 * `dayInZone` — the day a shop-calendar rule groups by. The subject is the boundary: the same
 * instant is two different days in UTC and in the shop's zone.
 */
import { dayInZone } from '@domain-primitives/time';

describe('dayInZone', () => {
    it('puts 00:30 on the 5th in Rome on the 5th, while UTC is still on the 4th', () => {
        const instant = new Date('2026-01-04T23:30:00Z');

        expect(instant.toISOString().slice(0, 10)).toBe('2026-01-04');
        expect(dayInZone(instant, 'Europe/Rome')).toBe('2026-01-05');
    });

    it('keeps 23:30 on the 4th in New York on the 4th, while UTC has moved on', () => {
        expect(dayInZone(new Date('2026-01-05T04:30:00Z'), 'America/New_York')).toBe('2026-01-04');
    });

    it('agrees with UTC in UTC, padding a single-digit month and day', () => {
        expect(dayInZone(new Date('2026-03-07T12:00:00Z'), 'UTC')).toBe('2026-03-07');
    });
});
