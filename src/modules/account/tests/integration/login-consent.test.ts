/**
 * @module
 * Which consent gates the `user_logged_in` analytics event: the account's stored answer, yes or
 * no, and only for an account that never answered, the banner header. Driven through the real
 * login route, with the resolved provider's `capture` spied on.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import {
    resetAnalyticsProvider,
    resolveAnalyticsProvider
} from '@infrastructure/observability/analytics';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** What the provider was asked to capture. */
let capture: jest.SpyInstance;

beforeEach(() => {
    setEnvironment({ NODE_ANALYTICS_PROVIDER: 'none' });
    setEnvironment({ NODE_ANALYTICS_REQUIRE_CONSENT: 'true' });
    resetAnalyticsProvider();
    capture = jest.spyOn(resolveAnalyticsProvider(), 'capture');
});

afterEach(() => {
    jest.restoreAllMocks();
    resetAnalyticsProvider();
});

/** Logs in `slug`'s account, with the banner header when one is given. */
const loginWith = async (stored: boolean | undefined, header: 'true' | undefined, slug: string) => {
    const email = `${slug}@example.com`;
    await createUser({
        email,
        username: slug,
        ...(stored === undefined
            ? {}
            : { analyticsConsent: stored, analyticsConsentAt: new Date() })
    });
    const request = api().post('/account/login');
    if (header) void request.set('Analytics-Consent', header);
    const response = await request.send({ email, password: PLAIN_PASSWORD });
    expect(response.status).toBe(200);
};

describe('the login analytics event', () => {
    it('is not sent when the account withdrew consent, though the banner says yes', async () => {
        await loginWith(false, 'true', 'withdrawn');

        expect(capture).not.toHaveBeenCalled();
    });

    it('is sent when the account consented, with no banner header', async () => {
        await loginWith(true, undefined, 'consented');

        expect(capture).toHaveBeenCalledWith(expect.objectContaining({ event: 'user_logged_in' }));
    });

    it('follows the banner header when the account never answered', async () => {
        await loginWith(undefined, 'true', 'banner-yes');
        expect(capture).toHaveBeenCalledTimes(1);

        capture.mockClear();
        await loginWith(undefined, undefined, 'banner-none');
        expect(capture).not.toHaveBeenCalled();
    });
});
