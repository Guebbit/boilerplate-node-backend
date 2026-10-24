/**
 * `oneCalendarMonthLaterUtc` — the EDPB way of counting a month (Guidelines 01/2022 v2 ¶160,
 * Ex. 32-33). The subject is the clamp to a short month and the year rollover.
 */
import { oneCalendarMonthLaterUtc } from '@domain-primitives/time';

describe('oneCalendarMonthLaterUtc', () => {
    it.each([
        [
            '5 March reaches 5 April (EDPB Ex. 32)',
            '2026-03-05T14:30:00Z',
            '2026-04-05T00:00:00.000Z'
        ],
        [
            '31 August reaches 30 September (EDPB Ex. 33)',
            '2026-08-31T08:00:00Z',
            '2026-09-30T00:00:00.000Z'
        ],
        ['31 January clamps to 28 February', '2026-01-31T08:00:00Z', '2026-02-28T00:00:00.000Z'],
        [
            '31 January clamps to 29 February in a leap year',
            '2028-01-31T08:00:00Z',
            '2028-02-29T00:00:00.000Z'
        ],
        ['15 December rolls into January', '2026-12-15T23:59:59.999Z', '2027-01-15T00:00:00.000Z'],
        ['31 December reaches 31 January', '2026-12-31T00:00:00Z', '2027-01-31T00:00:00.000Z']
    ])('%s', (_name, from, expected) => {
        expect(oneCalendarMonthLaterUtc(new Date(from)).toISOString()).toBe(expected);
    });
});
