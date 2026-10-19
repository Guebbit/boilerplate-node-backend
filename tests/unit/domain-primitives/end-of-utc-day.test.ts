/**
 * `endOfUtcDay` — the last instant of the date a deadline prints. The subject is the boundary: an
 * instant just after midnight and one just before it land on the same closing millisecond.
 */
import { endOfUtcDay } from '@domain-primitives/time';

describe('endOfUtcDay', () => {
    it.each([
        ['just after midnight', '2026-03-05T00:00:00.000Z'],
        ['midday', '2026-03-05T12:00:00.000Z'],
        ['the last millisecond', '2026-03-05T23:59:59.999Z']
    ])('closes the 5th at its last millisecond, from %s', (_name, instant) => {
        expect(endOfUtcDay(new Date(instant)).toISOString()).toBe('2026-03-05T23:59:59.999Z');
    });

    it('rolls over a month and a year end', () => {
        expect(endOfUtcDay(new Date('2026-12-31T08:00:00Z')).toISOString()).toBe(
            '2026-12-31T23:59:59.999Z'
        );
        expect(endOfUtcDay(new Date('2028-02-29T08:00:00Z')).toISOString()).toBe(
            '2028-02-29T23:59:59.999Z'
        );
    });
});
