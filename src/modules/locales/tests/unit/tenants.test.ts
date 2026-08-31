/**
 * @module
 * The tenant registry: configuration read back, with the demo pair as its floor. Every reader is
 * lazy, so each case sets the environment and reads; `afterEach` restores what the suite started
 * with, since a leaked `NODE_LOCALE_TENANTS_EXTRA` would let an unrelated contract test accept a
 * tenant nobody configured.
 */

import {
    backendTenant,
    frontendTenant,
    frontendTenantIds,
    isFrontendTenant,
    isKnownTenant,
    listTenants
} from '../../tenants';

const KEYS = [
    'NODE_LOCALE_TENANT_BACKEND',
    'NODE_LOCALE_TENANT_FRONTEND',
    'NODE_LOCALE_TENANTS_EXTRA'
] as const;
const original: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
    for (const key of KEYS) {
        original[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of KEYS) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
    }
});

describe('the tenant registry', () => {
    it('defaults to the demo pair, the backend first', () => {
        expect(listTenants()).toEqual([
            { id: 'demo-be', label: 'API', kind: 'backend' },
            { id: 'demo-fe', label: 'Frontend', kind: 'frontend' }
        ]);
        expect(backendTenant()).toBe('demo-be');
        expect(frontendTenant()).toBe('demo-fe');
    });

    it('reads the two ids from the environment', () => {
        process.env.NODE_LOCALE_TENANT_BACKEND = 'shop-api';
        process.env.NODE_LOCALE_TENANT_FRONTEND = 'shop-web';

        expect(listTenants().map(({ id }) => id)).toEqual(['shop-api', 'shop-web']);
    });

    it('adds the extra frontends, labelled or not, and drops a duplicate', () => {
        process.env.NODE_LOCALE_TENANTS_EXTRA = ' mobile=Mobile app , kiosk ,, demo-fe=Again ';

        expect(listTenants()).toEqual([
            { id: 'demo-be', label: 'API', kind: 'backend' },
            { id: 'demo-fe', label: 'Frontend', kind: 'frontend' },
            { id: 'mobile', label: 'Mobile app', kind: 'frontend' },
            { id: 'kiosk', label: 'kiosk', kind: 'frontend' }
        ]);
    });

    it('tells a frontend tenant from the backend one and from a stranger', () => {
        process.env.NODE_LOCALE_TENANTS_EXTRA = 'mobile';

        expect(frontendTenantIds()).toEqual(['demo-fe', 'mobile']);
        expect(isFrontendTenant('mobile')).toBe(true);
        expect(isFrontendTenant('demo-be')).toBe(false);
        expect(isKnownTenant('demo-be')).toBe(true);
        expect(isKnownTenant('nobody')).toBe(false);
    });
});
