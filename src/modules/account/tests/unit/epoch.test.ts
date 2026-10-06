/**
 * @module
 * `predatesSessionEpoch` — the one comparison the resolver and the refresh path share.
 */

import { predatesSessionEpoch } from '../../session/epoch';

describe('predatesSessionEpoch', () => {
    const epoch = new Date('2026-10-06T12:00:00.900Z');
    const epochSecond = Math.floor(epoch.getTime() / 1000);

    it('never refuses when no event ever moved the epoch', () => {
        expect(predatesSessionEpoch(0, undefined)).toBe(false);
    });

    it('refuses a token stamped in an earlier second', () => {
        expect(predatesSessionEpoch(epochSecond - 1, epoch)).toBe(true);
    });

    it('keeps a token stamped in the very second of the bump, so the caller survives its own', () => {
        expect(predatesSessionEpoch(epochSecond, epoch)).toBe(false);
    });

    it('keeps a token stamped later', () => {
        expect(predatesSessionEpoch(epochSecond + 5, epoch)).toBe(false);
    });
});
