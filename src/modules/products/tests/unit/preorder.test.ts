/**
 * @module
 * `isPreorder` and `latestReleaseDate`, from the products domain. Pure, so every
 * edge of the rule runs against a fixed clock.
 */
import { isPreorder, latestReleaseDate } from '../../domain/preorder';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const LATER = new Date('2026-12-01T00:00:00.000Z');
const EARLIER = new Date('2026-09-01T00:00:00.000Z');

describe('isPreorder', () => {
    it.each([
        ['a future date on a visible, buyable product', { releaseDate: LATER }, true],
        [
            'explicit flags that allow it',
            { active: true, purchasable: true, releaseDate: LATER },
            true
        ],
        ['no date at all', {}, false],
        ['a date in the past', { releaseDate: EARLIER }, false],
        ['a date exactly now', { releaseDate: NOW }, false],
        ['a hidden product', { active: false, releaseDate: LATER }, false],
        ['an off-sale product', { purchasable: false, releaseDate: LATER }, false]
    ])('%s', (_name, facts, expected) => {
        expect(isPreorder(facts, NOW)).toBe(expected);
    });
});

describe('latestReleaseDate', () => {
    it('is the same instant one calendar year on', () => {
        expect(latestReleaseDate(NOW).toISOString()).toBe('2027-10-12T10:00:00.000Z');
    });

    it('does not mutate its argument', () => {
        const before = NOW.getTime();
        latestReleaseDate(NOW);
        expect(NOW.getTime()).toBe(before);
    });
});
