/**
 * @module
 * The app registry: configuration read back, with the demo pair as its floor. Every reader is
 * lazy, so each case sets the environment and reads; `afterEach` restores what the suite started
 * with, since a leaked `NODE_LOCALE_APPS_EXTRA` would let an unrelated contract test accept a
 * app nobody configured.
 */

import {
    backendApp,
    frontendApp,
    frontendAppIds,
    isFrontendApp,
    isKnownApp,
    listApps
} from '../../apps';
import { setEnvironment, withoutEnvironmentInThisFile } from '@tests/environment';

const KEYS = [
    'NODE_LOCALE_APP_BACKEND',
    'NODE_LOCALE_APP_FRONTEND',
    'NODE_LOCALE_APPS_EXTRA'
] as const;

withoutEnvironmentInThisFile(KEYS);

describe('the app registry', () => {
    it('defaults to the demo pair, the backend first', () => {
        expect(listApps()).toEqual([
            { id: 'demo-be', label: 'API', kind: 'backend' },
            { id: 'demo-fe', label: 'Frontend', kind: 'frontend' }
        ]);
        expect(backendApp()).toBe('demo-be');
        expect(frontendApp()).toBe('demo-fe');
    });

    it('reads the two ids from the environment', () => {
        setEnvironment({ NODE_LOCALE_APP_BACKEND: 'shop-api' });
        setEnvironment({ NODE_LOCALE_APP_FRONTEND: 'shop-web' });

        expect(listApps().map(({ id }) => id)).toEqual(['shop-api', 'shop-web']);
    });

    it('adds the extra frontends, labelled or not, and drops a duplicate', () => {
        setEnvironment({
            NODE_LOCALE_APPS_EXTRA: ' mobile=Mobile app , kiosk ,, demo-fe=Again '
        });

        expect(listApps()).toEqual([
            { id: 'demo-be', label: 'API', kind: 'backend' },
            { id: 'demo-fe', label: 'Frontend', kind: 'frontend' },
            { id: 'mobile', label: 'Mobile app', kind: 'frontend' },
            { id: 'kiosk', label: 'kiosk', kind: 'frontend' }
        ]);
    });

    it('tells a frontend app from the backend one and from a stranger', () => {
        setEnvironment({ NODE_LOCALE_APPS_EXTRA: 'mobile' });

        expect(frontendAppIds()).toEqual(['demo-fe', 'mobile']);
        expect(isFrontendApp('mobile')).toBe(true);
        expect(isFrontendApp('demo-be')).toBe(false);
        expect(isKnownApp('demo-be')).toBe(true);
        expect(isKnownApp('nobody')).toBe(false);
    });
});
