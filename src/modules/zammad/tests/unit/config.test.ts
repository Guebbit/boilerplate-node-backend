/**
 * @module
 * The settings' boot check: inert with no URL, and a URL needs the token and the group beside it.
 */

import { setEnvironment } from '@tests/environment';
import { zammadConfig, zammadEnabled, zammadSettings } from '../../config';

/** The problems the slice reports for an environment. */
const problems = (environment: Record<string, string>) =>
    zammadConfig.slice.inspect(environment).checks;

describe('zammad config', () => {
    it('is inert with no URL, and asks for nothing', () => {
        expect(problems({})).toEqual([]);
        setEnvironment({ NODE_ZAMMAD_URL: undefined });
        expect(zammadEnabled()).toBe(false);
        expect(zammadSettings()).toBeUndefined();
    });

    it('wants the token and the group beside a URL', () => {
        expect(problems({ NODE_ZAMMAD_URL: 'http://zammad:3000' })).toEqual([
            'NODE_ZAMMAD_API_TOKEN is required when NODE_ZAMMAD_URL is set',
            'NODE_ZAMMAD_GROUP is required when NODE_ZAMMAD_URL is set'
        ]);
    });

    it('refuses a URL that is not one', () => {
        expect(
            problems({
                NODE_ZAMMAD_URL: 'zammad',
                NODE_ZAMMAD_API_TOKEN: 'token',
                NODE_ZAMMAD_GROUP: 'Support'
            })
        ).toEqual(['NODE_ZAMMAD_URL is not a URL']);
    });

    it('accepts a complete set, and drops a trailing slash from the address', () => {
        const complete = {
            NODE_ZAMMAD_URL: 'http://zammad:3000/',
            NODE_ZAMMAD_API_TOKEN: 'token',
            NODE_ZAMMAD_GROUP: 'Support'
        };
        expect(problems(complete)).toEqual([]);
        setEnvironment(complete);
        expect(zammadSettings()).toEqual({
            url: 'http://zammad:3000',
            token: 'token',
            group: 'Support'
        });
    });

    it('keeps tickets 730 days by default', () => {
        expect(zammadConfig().NODE_ZAMMAD_RETENTION_DAYS).toBe(730);
    });
});
