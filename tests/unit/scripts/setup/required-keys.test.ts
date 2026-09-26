/**
 * `fillableKeys` — every real placeholder `npm run setup` can fill, read off the enabled modules
 * and the app-level checks rather than a hand-kept list. A new module's secret is covered the
 * moment it declares one; nothing here should ever need editing for that.
 */
import { fillableKeys } from '../../../../scripts/setup/required-keys';

describe('fillableKeys', () => {
    const keys = fillableKeys();

    it('finds at least the well-known session and metrics secrets', () => {
        const names = keys.map((entry) => entry.key);

        expect(names).toEqual(
            expect.arrayContaining([
                'NODE_TOKEN_ACCESS',
                'NODE_TOKEN_REFRESH',
                'NODE_METRICS_TOKEN'
            ])
        );
    });

    it('never includes an entry with no placeholder to replace', () => {
        // NODE_URL is required but has no placeholder — an operator's own value, not a stand-in.
        expect(keys.map((entry) => entry.key)).not.toContain('NODE_URL');
    });

    it('carries no duplicate keys — one entry per variable, even across modules', () => {
        const names = keys.map((entry) => entry.key);

        expect(new Set(names).size).toBe(names.length);
    });
});
